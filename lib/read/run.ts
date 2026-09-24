import { proposeCompetingBrands, type ProposedBrand } from "@/lib/ai/rivals";
import type { Business, Service } from "@/lib/db/types";
import { isApifyConfigured, isModelConfigured } from "@/lib/env";
import { normalizeUrl } from "@/lib/import/website";
import { brandDomain, isMarketplace } from "@/lib/intel/discover-brands";
import { readRivalSite } from "@/lib/intel/direct";
import { readProspectSite, type ProspectSite } from "@/lib/prospect/teardown";
import { fetchAdvertiserAds, isRivalAd, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";

import { templateReadBrief, writeReadBrief, type ReadBrief } from "./brief";
import { EXAMPLE_BRAND, EXAMPLE_BRIEF, EXAMPLE_RIVALS, exampleAds } from "./example";
import { findGap, summarizeAdvertiser, type AdvertiserSummary, type Gap } from "./gap";

/**
 * The category read: a store's URL in, and within about a minute its live
 * Meta ads, its rivals' longest-running ads, the opening they keep paying
 * for that it doesn't, and one brief that fills the gap. No account, no
 * export, nothing connected. It is the first thing a visitor sees and the
 * reason to sign up.
 *
 * Each stage is sent the moment it lands, so the page fills in while the
 * slow part (one Ad Library run per advertiser) is still going. A stage
 * that fails says so and the read goes on; only an unreadable site ends it.
 * Nothing is stored: the read is recomputed, or served from the route's
 * short cache.
 */

export interface ReadBrand {
  name: string;
  domain: string;
  category: string;
  products: { name: string; price: string }[];
}

export interface ReadRival {
  name: string;
  domain: string;
  why: string;
}

export type ReadEvent =
  | { type: "status"; label: string }
  | { type: "brand"; brand: ReadBrand }
  | { type: "rivals"; rivals: ReadRival[] }
  | { type: "advertiser"; role: "brand" | "rival"; summary: AdvertiserSummary }
  | { type: "advertiser_failed"; role: "brand" | "rival"; name: string }
  | { type: "gap"; gap: Gap }
  | { type: "brief"; brief: ReadBrief }
  | { type: "done"; example: boolean }
  | { type: "error"; reason: string };

/** Rivals shown on the page: enough to agree with each other, few enough to read in a minute. */
export const READ_RIVALS = 4;
/** Proposed rivals whose sites are checked, to end with READ_RIVALS that exist. */
const RIVAL_CANDIDATES = 7;

export interface ReadDeps {
  live?: () => boolean;
  readSite?: (url: string, onStatus: (label: string) => void) => Promise<ProspectSite>;
  readHandles?: (url: string) => Promise<{ facebook?: string | null } | null>;
  propose?: (business: Business, services: Service[], siteText: string) => Promise<ProposedBrand[]>;
  siteLoads?: (domain: string) => Promise<{ facebook?: string | null } | null>;
  fetchAds?: (name: string) => Promise<AdvertiserAd[]>;
  writeBrief?: typeof writeReadBrief;
  now?: () => Date;
}

export function isReadLive(): boolean {
  return isApifyConfigured && isModelConfigured;
}

const cents = (price: string): number | null => {
  const n = Math.round(parseFloat(price.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The fields the rival prompt reads, on a business that is never stored. */
function transientBusiness(site: ProspectSite): Business {
  return {
    name: site.name,
    website: site.website,
    category: site.category,
    price_band: site.priceBand,
    monthly_ad_spend: null,
  } as Business;
}

function transientServices(site: ProspectSite): Service[] {
  return site.services.map((s) => ({ name: s.name, price_cents: cents(s.price), is_active: true }) as Service);
}

/** The read of a brand no key can reach: the invented example, through the same arithmetic. */
async function runExample(emit: (e: ReadEvent) => void, now: Date): Promise<void> {
  const pause = () => new Promise((r) => setTimeout(r, 350));
  emit({ type: "status", label: "No live keys on this install: showing an example read of an invented brand." });
  const { siteText, ...brand } = EXAMPLE_BRAND;
  void siteText;
  emit({ type: "brand", brand });
  await pause();
  emit({ type: "rivals", rivals: EXAMPLE_RIVALS });
  const ads = exampleAds(now);
  const own = summarizeAdvertiser(brand.name, brand.domain, ads[brand.name] ?? []);
  emit({ type: "advertiser", role: "brand", summary: own });
  const rivals: AdvertiserSummary[] = [];
  for (const r of EXAMPLE_RIVALS) {
    await pause();
    const summary = summarizeAdvertiser(r.name, r.domain, ads[r.name] ?? []);
    rivals.push(summary);
    emit({ type: "advertiser", role: "rival", summary });
  }
  const gap = findGap(own, rivals);
  emit({ type: "gap", gap });
  await pause();
  emit({ type: "brief", brief: { ...EXAMPLE_BRIEF, because: `${gap.headline} ${gap.limit}`, writer: "template" } });
  emit({ type: "done", example: true });
}

async function settle<T>(work: Promise<T>, label: string): Promise<T | null> {
  try {
    return await work;
  } catch (err) {
    console.warn(`[read] ${label} failed:`, (err as Error).message);
    return null;
  }
}

/** Pure: the proposed brands worth checking, in the model's order. */
export function rivalCandidates(proposed: ProposedBrand[], own: { name: string; domain: string | null }): (ProposedBrand & { domain: string })[] {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Set<string>();
  const out: (ProposedBrand & { domain: string })[] = [];
  for (const b of proposed) {
    const domain = brandDomain(b.website);
    if (!domain || isMarketplace(b)) continue;
    if (domain === own.domain || squash(b.name) === squash(own.name)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ ...b, domain });
  }
  return out.slice(0, RIVAL_CANDIDATES);
}

export async function runCategoryRead(website: string, emit: (e: ReadEvent) => void, deps: ReadDeps = {}): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const url = normalizeUrl(website);
  if (!url) {
    emit({ type: "error", reason: "That doesn't look like a web address. Try yourbrand.com." });
    return;
  }
  if (!(deps.live ?? isReadLive)()) {
    await runExample(emit, now);
    return;
  }

  const readSite = deps.readSite ?? readProspectSite;
  const readHandles = deps.readHandles ?? ((u: string) => readRivalSite(u).then((r) => (r ? r.handles : null)));
  const propose =
    deps.propose ?? ((b: Business, s: Service[], text: string) => proposeCompetingBrands(b, s, null, text));
  const siteLoads = deps.siteLoads ?? ((d: string) => readRivalSite(d).then((r) => (r ? r.handles : null)));
  const fetchAds = deps.fetchAds ?? ((name: string) => fetchAdvertiserAds(name));
  const writeBrief = deps.writeBrief ?? writeReadBrief;

  let site: ProspectSite;
  try {
    site = await readSite(url, (label) => emit({ type: "status", label }));
  } catch (err) {
    console.warn("[read] site read failed:", (err as Error).message);
    emit({ type: "error", reason: "We couldn't read that site. Check the address, or try your store's homepage." });
    return;
  }
  const domain = brandDomain(url) ?? url;
  emit({ type: "brand", brand: { name: site.name, domain, category: site.category, products: site.services.slice(0, 8) } });

  // The brand's own ads start now, alongside naming its rivals: both are slow.
  emit({ type: "status", label: `Reading ${site.name}'s live Meta ads…` });
  const ownRead = (async (): Promise<AdvertiserSummary | null> => {
    const [handles, ads] = await Promise.all([settle(readHandles(url), "own handles"), settle(fetchAds(site.name), "own ads")]);
    if (ads === null) {
      emit({ type: "advertiser_failed", role: "brand", name: site.name });
      return null;
    }
    const mine = ads.filter((a) => isRivalAd({ name: site.name, facebook: handles?.facebook ?? null }, a));
    const summary = summarizeAdvertiser(site.name, domain, mine);
    emit({ type: "advertiser", role: "brand", summary });
    return summary;
  })();

  emit({ type: "status", label: "Naming your closest competitors…" });
  const proposed = (await settle(propose(transientBusiness(site), transientServices(site), site.text), "rival proposal")) ?? [];
  const candidates = rivalCandidates(proposed, { name: site.name, domain });
  const checked = await Promise.all(candidates.map(async (c) => ({ c, handles: await settle(siteLoads(c.domain), `site ${c.domain}`) })));
  // A brand whose site doesn't load is most often one the model made up.
  const rivals = checked.filter((r) => r.handles !== null).slice(0, READ_RIVALS);
  emit({ type: "rivals", rivals: rivals.map(({ c }) => ({ name: c.name, domain: c.domain, why: c.why })) });

  if (rivals.length > 0) emit({ type: "status", label: `Reading ${rivals.length === 1 ? "their" : `all ${rivals.length} rivals'`} live ads…` });
  const rivalReads = await Promise.all(
    rivals.map(async ({ c, handles }) => {
      const ads = await settle(fetchAds(c.name), `ads for ${c.name}`);
      if (ads === null) {
        emit({ type: "advertiser_failed", role: "rival", name: c.name });
        return null;
      }
      const theirs = ads.filter((a) => isRivalAd({ name: c.name, facebook: handles?.facebook ?? null }, a));
      const summary = summarizeAdvertiser(c.name, c.domain, theirs);
      emit({ type: "advertiser", role: "rival", summary });
      return summary;
    }),
  );
  const own = await ownRead;

  const gap = findGap(own, rivalReads.filter((r): r is AdvertiserSummary => r !== null));
  emit({ type: "gap", gap });

  if (gap.opening) {
    emit({ type: "status", label: "Writing the test that fills the gap…" });
    const input = { brand: site.name, category: site.category, products: site.services, siteText: site.text, gap };
    const brief = (await settle(writeBrief(input), "brief")) ?? templateReadBrief(input);
    emit({ type: "brief", brief });
  }
  emit({ type: "done", example: false });
}
