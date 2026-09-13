/**
 * Brand signal: the Competitive treatment applied to the brand itself. Its
 * own ad history, organic traction and catalog fit.
 *
 * Historical similarity 40% (how past ads like this did against the
 * account), catalog and economics fit 30%, organic validation 30% (how its
 * own posts on this did).
 */

import {
  SUB_WEIGHTS,
  percentileRank,
  signalScore,
  type BrandInput,
  type Confidence,
  type SignalComponent,
  type SignalScore,
} from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const BRAND_LOW_NOTE = "Your ads and posts haven't been read yet";
export const BRAND_THIN_NOTE = "Too little of your own history on this to lean on yet";
export const BRAND_HIGH_MIN_ADS = 10;

/** Lift ratio fallback: 0.5 or less is 0, 1.0 is 50, 1.5 or more is 100. */
export function absoluteLiftScore(ratio: number): number {
  if (ratio <= 0.5) return 0;
  return round1(clamp(((ratio - 0.5) / 1) * 100));
}

/** Engagement ratio: 0.5 or less is 0, 1.0 is 50, 2.0 or more is 100. */
export function engagementScore(ratio: number): number {
  if (ratio <= 0.5) return 0;
  if (ratio <= 1) return round1(((ratio - 0.5) / 0.5) * 50);
  return round1(clamp(50 + (ratio - 1) * 50));
}

function timesPhrase(ratio: number): string {
  const diff = Math.round((ratio - 1) * 100);
  if (Math.abs(diff) < 5) return "about your usual";
  return `${Math.abs(diff)}% ${diff > 0 ? "better" : "worse"} than your usual`;
}

function relativePhrase(score: number): string {
  if (score >= 80) return "one of your best results";
  if (score >= 60) return "better than most of your ads";
  if (score >= 40) return "about average for you";
  if (score >= 20) return "weaker than most of your ads";
  return "among your weakest results";
}

export function scoreBrand(input: BrandInput): SignalScore {
  const w = SUB_WEIGHTS.brand;

  // Historical performance similarity.
  let similarity: number | null = null;
  let similarityDetail = "No past ads like this one to compare";
  const lift = input.similarAdsLift;
  const pct = input.similarAdsCount > 0 && lift !== null ? percentileRank(lift, input.liftBaseline) : null;
  if (input.similarAdsCount > 0 && lift !== null) {
    similarity = pct ?? absoluteLiftScore(lift);
    const n = input.similarAdsCount;
    similarityDetail = `${n} past ${n === 1 ? "ad" : "ads"} like this did ${timesPhrase(lift)}${pct === null ? "" : `, ${relativePhrase(pct)}`}`;
  }

  // Catalog and economics fit. With no fit judgment but some facts known, the
  // base is 50 and the facts move it.
  const e = input.economics;
  let economics: number | null = null;
  let economicsDetail = "No catalog match read yet";
  const anyKnown = e.fit !== null || e.priceBandMatch !== null || e.inStock !== null || e.marginOk !== null;
  if (anyKnown) {
    let s = e.fit !== null ? clamp(e.fit, 0, 1) * 100 : 50;
    const issues: string[] = [];
    if (e.priceBandMatch === false) {
      s -= 20;
      issues.push("outside your price range");
    }
    if (e.marginOk === false) {
      s -= 15;
      issues.push("thin margin");
    }
    if (e.inStock === false) {
      s = 0;
      issues.unshift("out of stock");
    }
    economics = round1(clamp(s));
    const base =
      e.fit === null ? "Catalog fit not judged" : e.fit >= 0.7 ? "Fits your catalog well" : e.fit >= 0.4 ? "Partly fits your catalog" : "A weak fit for your catalog";
    economicsDetail = issues.length ? `${base}, but ${issues.join(" and ")}` : base;
  }

  // Organic validation.
  let organic: number | null = null;
  let organicDetail = input.organic.posts > 0 ? "None of your recent posts were on this" : "Your accounts haven't been read yet";
  if (input.organic.onTermPosts > 0 && input.organic.engagementRatio !== null) {
    organic = engagementScore(input.organic.engagementRatio);
    const n = input.organic.onTermPosts;
    organicDetail = `${n} of your ${n === 1 ? "post" : "posts"} on this got ${timesPhrase(input.organic.engagementRatio).replace("your usual", "your usual engagement")}`;
  }

  const components: SignalComponent[] = [
    { key: "similarity", label: "Past ad performance", weight: w.similarity, score: similarity, detail: similarityDetail },
    { key: "economics", label: "Catalog fit", weight: w.economics, score: economics, detail: economicsDetail },
    { key: "organic", label: "Organic traction", weight: w.organic, score: organic, detail: organicDetail },
  ];

  const present = components.filter((c) => c.score !== null).length;
  let confidence: Confidence = "low";
  // High needs a ranked lift, so the absolute fallback never gets past medium.
  if (input.adHistoryAds >= BRAND_HIGH_MIN_ADS && present === 3 && pct !== null) confidence = "high";
  else if (present >= 2) confidence = "medium";

  if (confidence !== "low") return signalScore("brand", components, confidence);
  const cta = { label: "Import past ads", href: input.settingsHref };
  const note = similarity === null && organic === null ? BRAND_LOW_NOTE : BRAND_THIN_NOTE;
  return signalScore("brand", components, "low", { note, cta });
}
