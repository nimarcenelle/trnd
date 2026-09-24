import type { Repo } from "@/lib/db/repo";
import type { Business, CompetitorRead } from "@/lib/db/types";
import { nameCore, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";

import { findGap, summarizeAdvertiser, type AdvertiserSummary, type Gap, type Opening } from "./gap";

/**
 * What the landing page shows before anyone types: the week's real reads,
 * summed across every brand on TRND, with nothing named.
 *
 * Every brand's rivals have their live Meta ads read daily
 * (lib/intel/social-ingest.ts), and each read is stored with the ads' copy
 * and start dates. This sums the last two weeks of those reads by category:
 * the longest-running ad, how many are past three weeks, how the long
 * runners open. It also picks one real category and lays it out as a
 * sample read with every brand renamed and scrubbed from the copy.
 *
 * Only reads the live Apify path wrote count (raw.source === "apify"), so
 * a seeded or demo store never passes for the market. A category needs
 * MIN_BRANDS advertisers before it is shown at all, so no single brand can
 * be picked out of it.
 */

export const MIN_BRANDS = 3;
const WINDOW_DAYS = 14;
const LONG_DAYS = 21;
/** Businesses read per build: the page is rebuilt hourly and this bounds the queries. */
const MAX_BUSINESSES = 300;
const SAMPLE_RIVALS = 4;

export interface CategoryPulse {
  category: string;
  brands: number;
  ads: number;
  longestDays: number | null;
  stillRunning: number;
  /** The opening most of the long runners use, and its share of them. */
  topOpening: Opening | null;
  topShare: number;
}

export interface MarketSample {
  category: string;
  own: AdvertiserSummary;
  rivals: AdvertiserSummary[];
  gap: Gap;
}

export interface MarketPulse {
  brands: number;
  ads: number;
  stillRunning: number;
  categories: CategoryPulse[];
  sample: MarketSample | null;
}

interface StoredAd {
  advertiser?: string;
  snippet?: string;
  headline?: string | null;
  startedOn?: string | null;
  url?: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "beauty & wellness" → "Beauty & wellness"; stored categories vary in case. */
function label(category: string): string {
  const c = clean(category);
  return c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "Consumer brands";
}

function daysSince(day: string, now: Date): number | null {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86400_000)) : null;
}

/** Pure: a stored read's ads as the reader's shape, running days recomputed for today. */
export function adsFromRead(read: Pick<CompetitorRead, "raw">, now: Date): AdvertiserAd[] {
  const raw = (read.raw ?? {}) as { source?: string; ads?: StoredAd[] };
  if (raw.source !== "apify" || !Array.isArray(raw.ads)) return [];
  return raw.ads.map((a, i) => {
    const startedOn = typeof a.startedOn === "string" ? a.startedOn : null;
    return {
      id: `${a.url ?? ""}#${i}`,
      advertiser: clean(a.advertiser ?? ""),
      snippet: clean(a.snippet ?? ""),
      headline: a.headline ? clean(a.headline) : null,
      cta: null,
      landing: null,
      startedOn,
      runningDays: startedOn ? daysSince(startedOn, now) : null,
      platforms: [],
      variants: 1,
      active: true,
      url: a.url ?? "",
    };
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure: copy with every brand in the category taken out. Each name, and
 * each distinctive word of it, becomes the brand's letter when it is the
 * advertiser's own and "[brand]" otherwise; links and handles go too.
 */
export function scrub(text: string, names: { name: string; label: string; words?: boolean }[], keep: string[] = []): string {
  let out = text
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b[\w-]+\.(com|co|io|shop|store|net|org|us|co\.uk)\b\S*/gi, "[link]")
    .replace(/@[\w.]+/g, "[handle]");
  // A word of the category ("shower", "filters") is never a brand's, even
  // when a brand's name contains it.
  const common = new Set(keep.flatMap((k) => key(k).split(" ")));
  // Longest names first, so "Clear Well Co" goes before "Clear".
  const terms = names
    .flatMap(({ name, label: l, words = true }) => [
      { term: clean(name), label: l },
      ...(words ? nameCore(name) : [])
        .filter((w) => w.length >= 4 && !common.has(w))
        .map((w) => ({ term: w, label: l })),
    ])
    .filter((t) => t.term.length >= 3)
    .sort((a, b) => b.term.length - a.term.length);
  for (const { term, label: l } of terms) {
    out = out.replace(new RegExp(`(?<![\\w])${escapeRe(term)}(?![\\w])`, "gi"), l);
  }
  return out;
}

function letter(i: number): string {
  return `Brand ${String.fromCharCode(65 + (i % 26))}`;
}

/** Pure: the sample read, from the one category with the most advertisers. */
export function pickSample(category: string, byAdvertiser: Map<string, AdvertiserAd[]>, otherNames: string[]): MarketSample | null {
  const advertisers = [...byAdvertiser.entries()]
    .filter(([, ads]) => ads.some((a) => a.snippet || a.headline))
    .sort((a, b) => b[1].length - a[1].length);
  if (advertisers.length < MIN_BRANDS) return null;

  // Try each advertiser in the reader's seat and keep the read with the
  // clearest gap: one missing outright, agreed on by the most rivals.
  const rank = (g: Gap) => (g.kind === "missing" ? 3 : g.kind === "underweight" ? 2 : g.kind === "no_ads" ? 1 : 0) * 100 + g.rivalsUsing * 10 + g.rivalAds;
  let best: { seat: number; rivals: number[]; gap: Gap } | null = null;
  for (let seat = 0; seat < advertisers.length; seat++) {
    const rivals = advertisers.map((_, i) => i).filter((i) => i !== seat).slice(0, SAMPLE_RIVALS);
    const summary = (i: number) => summarizeAdvertiser(advertisers[i][0], null, advertisers[i][1]);
    const gap = findGap(summary(seat), rivals.map(summary));
    if (!best || rank(gap) > rank(best.gap)) best = { seat, rivals, gap };
  }
  if (!best || !best.gap.opening) return null;

  const order = [best.seat, ...best.rivals];
  const labels = new Map(order.map((i, n) => [advertisers[i][0], letter(n)]));
  const names = [
    ...advertisers.map(([name]) => ({ name, label: labels.get(name) ?? "[brand]" })),
    // TRND's own brands: their full names only, since theirs are the words
    // most likely to be the category's own ("Shower filters brand").
    ...otherNames.map((name) => ({ name, label: "[brand]", words: false })),
  ];
  const anonymous = (i: number): AdvertiserSummary => {
    const [name, ads] = advertisers[i];
    const tag = labels.get(name) as string;
    const scrubbed = ads.map((a, n) => ({
      ...a,
      // The id came from the ad's Library link, which names the brand.
      id: `${tag}-${n}`,
      advertiser: tag,
      snippet: scrub(a.snippet, names, [category]),
      headline: a.headline ? scrub(a.headline, names, [category]) : null,
      url: "",
    }));
    return summarizeAdvertiser(tag, null, scrubbed);
  };
  const own = anonymous(best.seat);
  const rivals = best.rivals.map(anonymous);
  return { category, own, rivals, gap: findGap(own, rivals) };
}

/**
 * The pulse, from the store. Never throws: an empty pulse is what a new
 * install or a failed read shows, and the page hides what it can't back.
 */
export async function buildMarketPulse(repo: Repo, now = new Date()): Promise<MarketPulse> {
  const empty: MarketPulse = { brands: 0, ads: 0, stillRunning: 0, categories: [], sample: null };
  let businesses: Business[];
  try {
    businesses = (await repo.listAllBusinesses({ includeProspects: true })).slice(0, MAX_BUSINESSES);
  } catch (err) {
    console.warn("[read:market] listing businesses failed:", (err as Error).message);
    return empty;
  }

  // category key → advertiser name → ads. One rival is often watched by
  // several brands; its ads are counted once per category.
  const byCategory = new Map<string, { category: string; advertisers: Map<string, AdvertiserAd[]>; names: Set<string> }>();
  await Promise.all(
    businesses.map(async (b) => {
      let reads: CompetitorRead[];
      try {
        reads = await repo.listCompetitorReads(b.id, { sinceDays: WINDOW_DAYS });
      } catch {
        return;
      }
      const latest = new Map<string, CompetitorRead>();
      for (const r of reads) {
        if (r.kind !== "ads" || latest.has(r.competitor_id)) continue;
        latest.set(r.competitor_id, r);
      }
      const k = key(b.category || "consumer brands");
      const bucket = byCategory.get(k) ?? { category: label(b.category), advertisers: new Map(), names: new Set<string>() };
      bucket.names.add(b.name);
      for (const r of latest.values()) {
        const ads = adsFromRead(r, now).filter((a) => a.advertiser);
        if (ads.length === 0) continue;
        const name = ads[0].advertiser;
        const prior = bucket.advertisers.get(name);
        if (!prior || prior.length < ads.length) bucket.advertisers.set(name, ads);
      }
      byCategory.set(k, bucket);
    }),
  );

  const categories: CategoryPulse[] = [];
  let brands = 0;
  let ads = 0;
  let stillRunning = 0;
  let sampleFrom: { category: string; advertisers: Map<string, AdvertiserAd[]>; names: Set<string> } | null = null;
  for (const bucket of byCategory.values()) {
    const all = [...bucket.advertisers.values()];
    if (all.length < MIN_BRANDS) continue;
    const summaries = [...bucket.advertisers.entries()].map(([name, list]) => summarizeAdvertiser(name, null, list));
    const flat = all.flat();
    const long = flat.filter((a) => (a.runningDays ?? 0) >= LONG_DAYS);
    const openings = new Map<Opening, number>();
    for (const s of summaries) for (const [o, n] of Object.entries(s.openings) as [Opening, number][]) openings.set(o, (openings.get(o) ?? 0) + n);
    const total = [...openings.values()].reduce((a, b) => a + b, 0);
    const top = [...openings.entries()].sort((a, b) => b[1] - a[1])[0];
    const longest = flat.reduce<number | null>((m, a) => (a.runningDays !== null && (m === null || a.runningDays > m) ? a.runningDays : m), null);
    categories.push({
      category: bucket.category,
      brands: all.length,
      ads: flat.length,
      longestDays: longest,
      stillRunning: long.length,
      topOpening: top ? top[0] : null,
      topShare: top && total > 0 ? top[1] / total : 0,
    });
    brands += all.length;
    ads += flat.length;
    stillRunning += long.length;
    if (!sampleFrom || bucket.advertisers.size > sampleFrom.advertisers.size) sampleFrom = bucket;
  }
  categories.sort((a, b) => (b.longestDays ?? 0) - (a.longestDays ?? 0));

  const sample = sampleFrom ? pickSample(sampleFrom.category, sampleFrom.advertisers, [...sampleFrom.names]) : null;
  return { brands, ads, stillRunning, categories, sample };
}
