import type { Repo } from "@/lib/db/repo";
import type { Business, Competitor } from "@/lib/db/types";
import { isModelConfigured, isPlacesConfigured } from "@/lib/env";
import { discoverCompetingBrands } from "@/lib/intel/discover-brands";
import { readRivalSite, scoreDirectness, type RivalSiteRead } from "@/lib/intel/direct";
import { CHAIN_NAMES } from "@/lib/prospect/fit";
import { discoverPlaces, type DiscoveredPlace } from "@/lib/prospect/discover";
import { getPlanState, planLimits } from "@/lib/billing";

/**
 * The rivals an owner would name if asked — found for them. Named-rival
 * tracking is the section of an intel report that no keyword tool can
 * fake, and an empty "competitors you watch" panel is the difference
 * between a product and a form. On day one TRND resolves the nearest
 * same-category places, drops the business itself, closed listings and
 * national chains, reads the closest ten sites, and watches the five that
 * compete most directly (same items, same prices, same block; see
 * lib/intel/direct.ts). The owner can prune or add in Settings; the daily
 * read starts immediately.
 *
 * That is the local path. An online brand has no nearest anything: its
 * rivals are the brands selling the same product to the same customer, so
 * it seeds from lib/intel/discover-brands.ts instead, and Places plays no
 * part.
 */

export const SEED_COMPETITOR_COUNT = 5;
/** Rivals are the shops a customer would drive past to reach you. */
const SEED_RADIUS_MILES = 10;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|inc|llc|co|company|shop|store|nyc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const domain = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/** True when a discovered place is the business itself (name or domain). */
export function isSelf(place: Pick<DiscoveredPlace, "name" | "website">, business: Pick<Business, "name" | "website">): boolean {
  const a = norm(place.name);
  const b = norm(business.name);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  const da = domain(place.website);
  const db = domain(business.website);
  return Boolean(da && db && da === db);
}

/** Pure selection over a discovery result — unit-tested without Places. */
export function pickRivals(
  places: DiscoveredPlace[],
  business: Pick<Business, "name" | "website">,
  existing: Pick<Competitor, "name" | "place_id">[] = [],
  count = SEED_COMPETITOR_COUNT,
): DiscoveredPlace[] {
  const taken = new Set(existing.map((c) => c.place_id).filter(Boolean));
  const takenNames = new Set(existing.map((c) => norm(c.name)));
  const seen = new Set<string>();
  return places
    .filter((p) => p.businessStatus === null || p.businessStatus === "OPERATIONAL")
    .filter((p) => !isSelf(p, business))
    .filter((p) => !CHAIN_NAMES.test(p.name))
    .filter((p) => !taken.has(p.placeId) && !takenNames.has(norm(p.name)))
    .filter((p) => {
      const key = norm(p.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Nearest first; among equals, the one customers already know.
    .sort((a, b) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    .slice(0, count);
}

export interface SeedResult {
  created: Competitor[];
  /** Why nothing (or less) was seeded, in one line — for logs and the UI. */
  note: string | null;
}

/**
 * Most-direct first. Scores within 0.05 of each other are the same verdict
 * (a single extra shared word moves a score that much), so among those the
 * nearer shop wins, the way an owner would break the tie.
 */
export function orderByDirectness<T extends { directness: number; distanceMiles: number | null }>(rivals: T[]): T[] {
  const bucket = (d: number) => Math.round(d * 20);
  return [...rivals].sort(
    (a, b) => bucket(b.directness) - bucket(a.directness) || (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99),
  );
}

/** Nearest-first candidates whose sites are read before five are chosen. */
export const SEED_CANDIDATE_COUNT = 10;
/** Sites read at once: quick enough for onboarding's after(), gentle on the network. */
const READ_CONCURRENCY = 5;

export async function seedCompetitors(
  repo: Repo,
  business: Business,
  opts: { fetchHtml?: (url: string) => Promise<string> } = {},
): Promise<SeedResult> {
  if (business.market === "online") {
    // The brand list comes from the model and is verified against the web;
    // without the model there is nothing to verify, and a Places search would
    // return the wrong kind of rival.
    if (!isModelConfigured) return { created: [], note: "Competing-brand discovery isn't switched on for this workspace." };
    return discoverCompetingBrands(repo, business, { fetchHtml: opts.fetchHtml });
  }
  if (!isPlacesConfigured) return { created: [], note: "Rival discovery isn't switched on for this workspace." };
  const existing = await repo.listCompetitors(business.id);
  // The plan meters rivals tracked; discovery fills what is left of it.
  const cap = await getPlanState(repo, business)
    .then((p) => planLimits(p.plan).rivals)
    .catch(() => SEED_COMPETITOR_COUNT);
  const room = Math.min(SEED_COMPETITOR_COUNT, cap) - existing.length;
  if (room <= 0) return { created: [], note: null };
  const location = `${business.city}${business.region ? `, ${business.region}` : ""}`;
  const places = await discoverPlaces({
    location,
    radiusMiles: Math.min(business.radius_miles || SEED_RADIUS_MILES, SEED_RADIUS_MILES),
    categories: [business.category],
    cap: 20,
  });
  // Nearest is where the search starts, not where it ends: the ten closest
  // are read, and the five that sell what this business sells are kept.
  const candidates = pickRivals(places, business, existing, SEED_CANDIDATE_COUNT);
  const [ownServices, brief] = await Promise.all([
    repo.listServices(business.id).catch(() => []),
    repo.getBusinessBrief(business.id).catch(() => null),
  ]);
  const sites: (RivalSiteRead | null)[] = [];
  for (let i = 0; i < candidates.length; i += READ_CONCURRENCY) {
    const batch = candidates.slice(i, i + READ_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((p) =>
        p.website ? readRivalSite(p.website, { fetchHtml: opts.fetchHtml, category: business.category }) : null,
      ),
    );
    for (const r of settled) sites.push(r.status === "fulfilled" ? r.value : null);
  }
  const scored = candidates.map((p, i) => ({
    place: p,
    site: sites[i],
    distanceMiles: p.distanceMiles,
    ...scoreDirectness({
      ownServices,
      ownCategory: business.category,
      ownPriceBand: business.price_band,
      ownLexicon: brief?.lexicon ?? [],
      rival: { name: p.name, category: p.category, distanceMiles: p.distanceMiles, reviewCount: p.reviewCount, site: sites[i] },
    }),
  }));
  const rivals = orderByDirectness(scored).slice(0, room);
  const created: Competitor[] = [];
  for (const r of rivals) {
    created.push(
      await repo.createCompetitor({
        business_id: business.id,
        name: r.place.name,
        website: r.place.website,
        place_id: r.place.placeId,
        social_handles: r.site?.handles ?? {},
        directness: r.directness,
        directness_reason: r.reason,
      }),
    );
  }
  return {
    created,
    note: created.length === 0 ? `No same-category rivals found within ${SEED_RADIUS_MILES} miles of ${location}.` : null,
  };
}
