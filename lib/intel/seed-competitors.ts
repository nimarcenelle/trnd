import type { Repo } from "@/lib/db/repo";
import type { Business, Competitor } from "@/lib/db/types";
import { isPlacesConfigured } from "@/lib/env";
import { CHAIN_NAMES } from "@/lib/prospect/fit";
import { discoverPlaces, type DiscoveredPlace } from "@/lib/prospect/discover";

/**
 * The rivals an owner would name if asked — found for them. Named-rival
 * tracking is the section of an intel report that no keyword tool can
 * fake, and an empty "competitors you watch" panel is the difference
 * between a product and a form. On day one TRND resolves the nearest
 * same-category places, drops the business itself, closed listings and
 * national chains, and watches the closest five. The owner can prune or
 * add in Settings; the daily read starts immediately.
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

export async function seedCompetitors(repo: Repo, business: Business): Promise<SeedResult> {
  if (!isPlacesConfigured) return { created: [], note: "Rival discovery isn't switched on for this workspace." };
  const existing = await repo.listCompetitors(business.id);
  const room = SEED_COMPETITOR_COUNT - existing.length;
  if (room <= 0) return { created: [], note: null };
  const location = `${business.city}${business.region ? `, ${business.region}` : ""}`;
  const places = await discoverPlaces({
    location,
    radiusMiles: Math.min(business.radius_miles || SEED_RADIUS_MILES, SEED_RADIUS_MILES),
    categories: [business.category],
    cap: 20,
  });
  const rivals = pickRivals(places, business, existing, room);
  const created: Competitor[] = [];
  for (const r of rivals) {
    created.push(
      await repo.createCompetitor({
        business_id: business.id,
        name: r.name,
        website: r.website,
        place_id: r.placeId,
      }),
    );
  }
  return {
    created,
    note: created.length === 0 ? `No same-category rivals found within ${SEED_RADIUS_MILES} miles of ${location}.` : null,
  };
}
