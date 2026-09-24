import { hookTypeOf } from "@/lib/ads/classify";
import { PROVEN_DAYS, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";

import { OPENING_LABEL, OPENING_PHRASE, type Opening } from "./labels";

/**
 * The category read's arithmetic: what a brand has live, what its rivals
 * keep paying for, and the opening they lean on that it does not.
 *
 * Everything here is counted from the Ad Library, which says when an ad
 * started and nothing about spend or results. An ad still running after
 * three weeks has survived on its owner's money, so "still running after N
 * days" is the claim the page makes, never "their best ad". Openings are
 * read from the first line of copy by the same rules that classify a
 * brand's own ad history (lib/ads/classify.ts), so the words a visitor sees
 * here mean the same thing inside the product.
 */

export { OPENING_LABEL, OPENING_PHRASE, type Opening };

/** An ad as the page shows it: the words, how long it has run, its opening. */
export interface ReadAd {
  id: string;
  text: string;
  runningDays: number | null;
  opening: Opening | null;
  url: string;
}

export interface AdvertiserSummary {
  name: string;
  domain: string | null;
  active: number;
  /** Live ads still running after PROVEN_DAYS. */
  stillRunning: number;
  longestDays: number | null;
  /** Openings across the ads that count (still running, or all live when none are). */
  openings: Partial<Record<Opening, number>>;
  /** The longest-running live ads, up to three. */
  top: ReadAd[];
}

const TEXT_MAX = 180;

function adText(ad: AdvertiserAd): string {
  return [ad.headline, ad.snippet].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
}

export function openingOf(ad: AdvertiserAd): Opening | null {
  // The body is what a viewer reads first; the headline sits under the creative.
  const text = (ad.snippet || ad.headline || "").trim();
  if (!text) return null;
  const hook = hookTypeOf(text);
  return hook === "other" ? null : hook;
}

function toReadAd(ad: AdvertiserAd): ReadAd {
  const text = adText(ad);
  return {
    id: ad.id,
    text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1).trimEnd()}…` : text,
    runningDays: ad.runningDays,
    opening: openingOf(ad),
    url: ad.url,
  };
}

/** Pure: one advertiser's live ads, read for the page. */
export function summarizeAdvertiser(name: string, domain: string | null, ads: AdvertiserAd[]): AdvertiserSummary {
  const live = ads.filter((a) => a.active);
  const byLongest = [...live].sort((a, b) => (b.runningDays ?? -1) - (a.runningDays ?? -1));
  const still = byLongest.filter((a) => (a.runningDays ?? 0) >= PROVEN_DAYS);
  // A brand that only launched this month still has a mix worth reading;
  // "still running" is the stronger read when there is one.
  const counted = still.length > 0 ? still : live;
  const openings: Partial<Record<Opening, number>> = {};
  for (const ad of counted) {
    const o = openingOf(ad);
    if (o) openings[o] = (openings[o] ?? 0) + 1;
  }
  // Ads with words first: an image-only ad has nothing to quote.
  const top = [...byLongest.filter((a) => adText(a)), ...byLongest.filter((a) => !adText(a))].slice(0, 3).map(toReadAd);
  return {
    name,
    domain,
    active: live.length,
    stillRunning: still.length,
    longestDays: byLongest[0]?.runningDays ?? null,
    openings,
    top,
  };
}

export type GapKind =
  /** Rivals keep an opening running; the brand has none live. */
  | "missing"
  /** The brand runs it, but far less of its mix than the rivals' mix. */
  | "underweight"
  /** The brand has no live ads: this is the opening to enter with. */
  | "no_ads"
  /** Nothing the rivals lean on is missing from the brand's mix. */
  | "none";

export interface Gap {
  kind: GapKind;
  opening: Opening | null;
  /** Rivals with at least one counted ad on this opening. */
  rivalsUsing: number;
  /** Rivals whose ads were read. */
  rivalsRead: number;
  /** Counted rival ads on this opening. */
  rivalAds: number;
  /** The brand's live ads on this opening. */
  brandAds: number;
  /** One sentence, built from the counts. */
  headline: string;
  /** What the counts can't say. */
  limit: string;
  /** A rival ad on this opening that is still running, to point at. */
  example: (ReadAd & { advertiser: string }) | null;
}

const LIMIT =
  "The Ad Library shows when an ad started, not what it spent or sold. An ad that is still running after three weeks is one its brand keeps paying for, which is a strong hint and not proof.";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Pure: the opening the rivals keep paying for that the brand is not
 * running. Ranked by how many rivals use it, then by how many of their
 * ads, so one rival's twenty variants never outvote three rivals agreeing.
 */
export function findGap(brand: AdvertiserSummary | null, rivals: AdvertiserSummary[]): Gap {
  const read = rivals.filter((r) => r.active > 0);
  const empty: Gap = {
    kind: "none",
    opening: null,
    rivalsUsing: 0,
    rivalsRead: read.length,
    rivalAds: 0,
    brandAds: 0,
    headline: "Your rivals' live ads didn't give us enough words to read an opening from.",
    limit: LIMIT,
    example: null,
  };
  if (read.length === 0) return empty;

  const stats = (Object.keys(OPENING_LABEL) as Opening[])
    .map((opening) => ({
      opening,
      rivalsUsing: read.filter((r) => (r.openings[opening] ?? 0) > 0).length,
      rivalAds: read.reduce((n, r) => n + (r.openings[opening] ?? 0), 0),
      brandAds: brand?.openings[opening] ?? 0,
    }))
    .filter((s) => s.rivalsUsing > 0)
    .sort((a, b) => b.rivalsUsing - a.rivalsUsing || b.rivalAds - a.rivalAds || a.opening.localeCompare(b.opening));
  if (stats.length === 0) return empty;

  const brandTotal = brand ? Object.values(brand.openings).reduce((n, c) => n + (c ?? 0), 0) : 0;
  const rivalTotal = stats.reduce((n, s) => n + s.rivalAds, 0);
  const example = (opening: Opening) => {
    for (const r of read) {
      const ad = r.top.find((a) => a.opening === opening && a.text);
      if (ad) return { ...ad, advertiser: r.name };
    }
    return null;
  };
  const who = (s: { rivalsUsing: number }) =>
    read.length === 1
      ? read[0].name
      : s.rivalsUsing === read.length
        ? `All ${read.length} of your rivals`
        : `${s.rivalsUsing} of your ${plural(read.length, "rival", "rivals")}`;
  const verb = (s: { rivalsUsing: number }) => (s.rivalsUsing === 1 ? "keeps" : "keep");

  if (!brand || brand.active === 0) {
    const s = stats[0];
    return {
      kind: "no_ads",
      ...s,
      rivalsRead: read.length,
      headline: `You have no Meta ads live. ${who(s)} ${verb(s)} ads running that ${OPENING_PHRASE[s.opening]}, and that's the one to enter with.`,
      limit: LIMIT,
      example: example(s.opening),
    };
  }

  const missing = stats.find((s) => s.brandAds === 0 && (s.rivalsUsing >= 2 || read.length === 1));
  if (missing) {
    return {
      kind: "missing",
      ...missing,
      rivalsRead: read.length,
      headline: `${who(missing)} ${verb(missing)} ads running that ${OPENING_PHRASE[missing.opening]}. You have none live.`,
      limit: LIMIT,
      example: example(missing.opening),
    };
  }

  // Every opening they lean on is in the mix somewhere: find the one the
  // brand gives the smallest share to against the rivals' share.
  if (brandTotal > 0 && rivalTotal > 0) {
    const under = stats
      .map((s) => ({ ...s, delta: s.rivalAds / rivalTotal - s.brandAds / brandTotal }))
      .filter((s) => s.delta >= 0.2)
      .sort((a, b) => b.delta - a.delta)[0];
    if (under) {
      const theirs = Math.round((under.rivalAds / rivalTotal) * 100);
      const yours = Math.round((under.brandAds / brandTotal) * 100);
      return {
        kind: "underweight",
        opening: under.opening,
        rivalsUsing: under.rivalsUsing,
        rivalsRead: read.length,
        rivalAds: under.rivalAds,
        brandAds: under.brandAds,
        headline: `Your rivals' long-running ads ${OPENING_PHRASE[under.opening]} ${theirs}% of the time. Yours do ${yours}% of the time.`,
        limit: LIMIT,
        example: example(under.opening),
      };
    }
  }

  const s = stats[0];
  return {
    ...empty,
    opening: s.opening,
    rivalsUsing: s.rivalsUsing,
    rivalAds: s.rivalAds,
    brandAds: s.brandAds,
    headline: `Your mix already covers what your rivals keep running. The most common opening among them is to ${OPENING_PHRASE[s.opening]}, and you run it too.`,
    example: example(s.opening),
  };
}
