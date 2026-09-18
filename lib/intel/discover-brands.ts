import { proposeCompetingBrands, type ProposedBrand } from "@/lib/ai/rivals";
import type { Repo } from "@/lib/db/repo";
import type { Business, Competitor, SocialHandles } from "@/lib/db/types";
import { cleanSocialHandles } from "@/lib/import/social-links";
import { readRivalSite, scoreDirectness, type RivalSiteRead } from "@/lib/intel/direct";
import { fetchAdvertiserAds, isAdLibraryApifyAvailable, isRivalAd, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";
import { normalizeHandle } from "@/lib/social";

/**
 * The direct competitors of an online brand, found for the owner. A DTC
 * brand's rival isn't down the street; it is the brand selling the same
 * kind of product to the same customer at the same price, and the one that
 * matters most is the one paying for that customer's feed this week.
 *
 * The model proposes up to twelve brands. Every one is then checked against
 * the world before it is watched: the site must load (an invented brand or
 * a guessed domain is the main way this goes wrong), handles come from the
 * site's own links before the model's memory, and the Meta Ad Library says
 * whether they are advertising right now. The five that compete most
 * directly are kept, with a small edge for the ones running ads, because
 * those are the ads the owner's ads are actually up against.
 */

/** The same five the local seed watches: enough for a panel, few enough to read daily. */
export const BRAND_SEED_COUNT = 5;
/** Sites and ad reads at once: quick enough for onboarding's after(), gentle on the network. */
const VERIFY_CONCURRENCY = 5;
/**
 * One bucket in the ordering (see bucket below). Enough to put an
 * advertising brand ahead of an equal quiet one, never enough to lift a
 * brand that sells something else over one that sells what you sell.
 */
export const ACTIVE_AD_BONUS = 0.05;

/**
 * Retailers and marketplaces sell everyone's product, so their ads say
 * nothing about a rival's strategy. Matched on the store domain's name or
 * the brand name, whichever the model got right.
 */
const MARKETPLACES = new Set([
  "amazon", "target", "walmart", "sephora", "ulta", "nordstrom", "macys", "kohls", "etsy", "ebay",
  "shein", "temu", "costco", "cvs", "walgreens", "bloomingdales", "saks", "saksfifthavenue", "revolve",
  "asos", "zappos", "wayfair", "iherb", "thrivemarket", "instacart", "dermstore", "netaporter", "farfetch",
  "ssense", "faire", "credobeauty", "anthropologie", "urbanoutfitters", "tjmaxx", "marshalls", "wholefoods",
  "gnc", "vitaminshoppe", "kroger", "bestbuy", "goop", "spacenk", "cultbeauty", "lookfantastic", "zalando",
]);

export interface BrandDiscoveryOptions {
  fetchHtml?: (url: string) => Promise<string>;
  propose?: typeof proposeCompetingBrands;
  readSite?: typeof readRivalSite;
  adsAvailable?: () => boolean;
  fetchAds?: (name: string) => Promise<AdvertiserAd[]>;
}

export interface BrandDiscoveryResult {
  created: Competitor[];
  /** Why nothing (or less) was seeded, in one line — for logs and the UI. */
  note: string | null;
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** "https://www.Brand.com/shop" to "brand.com"; null when it isn't a domain at all. */
export function brandDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function isMarketplace(brand: Pick<ProposedBrand, "name" | "website">): boolean {
  const host = brandDomain(brand.website);
  const label = host ? squash(host.split(".").slice(-2)[0] ?? "") : "";
  return MARKETPLACES.has(label) || MARKETPLACES.has(squash(brand.name));
}

async function settle<T>(work: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work();
  } catch (err) {
    console.warn(`[intel] brand discovery: ${label} failed (non-fatal):`, (err as Error).message);
    return fallback;
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * A link on the brand's own site is the account they actually run; the
 * model's handle only fills a platform the site doesn't link.
 */
function pickHandles(site: RivalSiteRead, brand: ProposedBrand): SocialHandles {
  const fromModel = cleanSocialHandles({
    instagram: brand.instagram ? normalizeHandle("instagram", brand.instagram) : undefined,
    tiktok: brand.tiktok ? normalizeHandle("tiktok", brand.tiktok) : undefined,
  });
  return { ...fromModel, ...site.handles };
}

export async function discoverCompetingBrands(
  repo: Repo,
  business: Business,
  opts: BrandDiscoveryOptions = {},
): Promise<BrandDiscoveryResult> {
  const propose = opts.propose ?? proposeCompetingBrands;
  const readSite = opts.readSite ?? readRivalSite;
  const fetchAds = opts.fetchAds ?? ((name: string) => fetchAdvertiserAds(name));
  const adsOn = (opts.adsAvailable ?? isAdLibraryApifyAvailable)();

  const existing = await repo.listCompetitors(business.id);
  const room = BRAND_SEED_COUNT - existing.length;
  if (room <= 0) return { created: [], note: null };

  const read = (url: string) =>
    settle(() => readSite(url, { fetchHtml: opts.fetchHtml, category: business.category }), null, `read ${url}`);

  // The owner's own site tells the model what they sell in their words,
  // which a thin product list from onboarding may not.
  const [ownServices, brief, ownSite] = await Promise.all([
    repo.listServices(business.id).catch(() => []),
    repo.getBusinessBrief(business.id).catch(() => null),
    business.website ? read(business.website) : Promise.resolve(null),
  ]);
  const proposed = await settle(() => propose(business, ownServices, brief, ownSite?.text), [], "proposal");
  if (proposed.length === 0) return { created: [], note: `Couldn't name brands competing with ${business.name} yet.` };

  const ownDomain = brandDomain(business.website);
  const taken = new Set(existing.map((c) => brandDomain(c.website)).filter(Boolean));
  const takenNames = new Set(existing.map((c) => squash(c.name)));
  const seen = new Set<string>();
  const candidates = proposed
    .map((brand, rank) => ({ brand, rank, domain: brandDomain(brand.website) }))
    .filter((c): c is { brand: ProposedBrand; rank: number; domain: string } => c.domain !== null)
    .filter((c) => !isMarketplace(c.brand))
    .filter((c) => c.domain !== ownDomain && squash(c.brand.name) !== squash(business.name))
    .filter((c) => !taken.has(c.domain) && !takenNames.has(squash(c.brand.name)))
    .filter((c) => {
      if (seen.has(c.domain)) return false;
      seen.add(c.domain);
      return true;
    });

  const verified = await inBatches(candidates, VERIFY_CONCURRENCY, async (c) => {
    const site = await read(c.domain);
    // No site, no rival: a brand we can't load is most often one the model made up.
    if (!site) return null;
    // Only a brand that proved it exists costs an Ad Library run.
    const activeAds = adsOn
      ? await settle(
          async () =>
            (await fetchAds(c.brand.name)).filter((a) => a.active && isRivalAd({ name: c.brand.name, facebook: site.handles.facebook }, a)).length,
          null,
          `ads for ${c.brand.name}`,
        )
      : null;
    return { ...c, site, activeAds };
  });

  const scored = verified
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => {
      const { directness, reason } = scoreDirectness({
        ownServices,
        ownCategory: business.category,
        ownPriceBand: business.price_band,
        ownLexicon: brief?.lexicon ?? [],
        ownMarket: "online",
        rival: { name: v.brand.name, site: v.site, activeMetaAds: v.activeAds },
      });
      const bonus = (v.activeAds ?? 0) > 0 ? ACTIVE_AD_BONUS : 0;
      return { ...v, directness: Math.round(Math.min(1, directness + bonus) * 100) / 100, reason };
    });

  // Scores within 0.05 are the same verdict (see orderByDirectness in
  // seed-competitors.ts). Among those the brand advertising harder wins,
  // then the one the model put first.
  const bucket = (d: number) => Math.round(d * 20);
  scored.sort(
    (a, b) =>
      bucket(b.directness) - bucket(a.directness) || (b.activeAds ?? 0) - (a.activeAds ?? 0) || a.rank - b.rank,
  );

  const created: Competitor[] = [];
  for (const r of scored.slice(0, room)) {
    const row = await settle(
      () =>
        repo.createCompetitor({
          business_id: business.id,
          name: r.brand.name,
          website: `https://${r.domain}`,
          place_id: null,
          social_handles: pickHandles(r.site, r.brand),
          directness: r.directness,
          directness_reason: r.reason,
        }),
      null,
      `save ${r.brand.name}`,
    );
    if (row) created.push(row);
  }
  return {
    created,
    note: created.length === 0 ? `None of the brands proposed as rivals to ${business.name} had a site we could read.` : null,
  };
}
