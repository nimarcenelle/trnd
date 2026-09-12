import type { SignalSource } from "@/lib/db/types";

/**
 * TRND Demand Points — the one number every pick is measured in.
 *
 * The problem this solves: every source TRND reads speaks a different
 * language, and most of them are relative to themselves. Google Trends is an
 * index against the term's OWN busiest day. The TikTok curve is normalized
 * against the hashtag's OWN peak. DataForSEO is absolute monthly searches.
 * YouTube is absolute weekly views. So "48% this week" on one pick and "48%
 * this week" on another could be two orders of magnitude apart in real
 * people, and a chart of either one tells an owner nothing about which to
 * spend money on. A self-relative index cannot rank.
 *
 * So points are absolute, not relative. Every read is first converted to
 * ESTIMATED WEEKLY REACH — roughly, how many people touched this thing in a
 * week — and reach is then mapped onto a 0–100 log scale with fixed anchors.
 * Fixed is the important word: a pick's score does not move because another
 * pick moved, and this week's 62 means the same thing as last quarter's 62.
 *
 * The honest caveat, stated here because it is stated in the UI too: a
 * search and a video view are not the same event, and adding them is a
 * modelling choice, not a measurement. INTENT_WEIGHT is that choice, written
 * down and weighted deliberately — somebody typing your service into Google
 * is worth far more than somebody being shown a video about it. The weights
 * are the product's opinion; the reach numbers under them are real.
 *
 * The scale is logarithmic because demand is. Linear points would put every
 * local term in the bottom two pixels of the chart and reserve the top for
 * national noise no shop can act on.
 */

/** A weekly touch on the floor of the scale — below this there is no market. */
const REACH_FLOOR = 10;
/** The top of the scale: national-scale weekly reach. Above it, points clamp
 * at 100 — the difference between 2M and 5M is not a decision an owner makes. */
const REACH_CEIL = 1_000_000;

/**
 * What one unit of each source is worth as a "person who might buy",
 * relative to one weekly search (1.0).
 *
 * A search is somebody actively looking. A short-form view is somebody who
 * was shown something — vastly more common and vastly less intentional, so
 * it is discounted hard. A post or thread is somebody who cared enough to
 * write, which is rare and high-signal, so it is worth more than a view.
 * These are deliberate product opinions and the only place they live.
 */
export const INTENT_WEIGHT: Partial<Record<SignalSource, number>> = {
  dataforseo: 1,
  google_trends: 1,
  google_suggest: 1,
  snapshot: 1,
  youtube: 0.02,
  tiktok: 0.02,
  reddit: 0.6,
  news: 0.5,
};

/** Weeks in a month, for turning monthly search volume into a weekly rate. */
const WEEKS_PER_MONTH = 4.345;

export interface ReachInput {
  source: SignalSource;
  metricType: string;
  /** The signal's stored value, in whatever unit the source speaks. */
  value: number | null;
}

/**
 * One signal → estimated weekly reach, in whole people-equivalents.
 *
 * Returns null for reads that carry no volume at all. A self-relative index
 * (Google Trends' 0–100, the TikTok curve) is explicitly NOT convertible:
 * "63 out of its own peak" contains no information about how many people
 * that is, and inventing a number from it would be the exact dishonesty
 * this module exists to remove. Those reads still drive momentum and the
 * grade — they just cannot contribute to an absolute scale.
 */
export function weeklyReach({ source, metricType, value }: ReachInput): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const weight = INTENT_WEIGHT[source];
  if (weight === undefined) return null;

  switch (metricType) {
    case "search_volume":
      // Google Ads keyword data is monthly; the product speaks in weeks.
      return (value / WEEKS_PER_MONTH) * weight;
    case "shortform_views":
      // Already a 7-day figure from both short-form adapters.
      return value * weight;
    case "conversation":
      return value * weight;
    case "coverage":
      return value * weight;
    // Indices. Real numbers, but relative to themselves — see the doc above.
    case "search_interest":
    default:
      return null;
  }
}

/** Estimated weekly reach → 0–100 points on the fixed log scale. */
export function pointsFromReach(reach: number | null): number | null {
  if (reach === null || !Number.isFinite(reach) || reach <= 0) return null;
  const clamped = Math.min(Math.max(reach, REACH_FLOOR), REACH_CEIL);
  const ratio = Math.log10(clamped / REACH_FLOOR) / Math.log10(REACH_CEIL / REACH_FLOOR);
  return Math.round(ratio * 100);
}

/** Points → the reach they stand for, so the UI can always say what a
 * number means in people rather than asking anyone to trust a scale. */
export function reachFromPoints(points: number): number {
  const ratio = Math.min(Math.max(points, 0), 100) / 100;
  return Math.round(REACH_FLOOR * (REACH_CEIL / REACH_FLOOR) ** ratio);
}

export interface DemandPointsResult {
  /** 0–100, or null when nothing measurable contributed. */
  points: number | null;
  /** Estimated people-equivalents per week behind the points. */
  reach: number | null;
  /** Which sources actually contributed, for the "how we got this" line. */
  contributing: SignalSource[];
  /** Sources present but unusable because they are self-relative indices. */
  indexOnly: SignalSource[];
}

/**
 * Every read TRND holds on one term this week → a single comparable number.
 *
 * Reach adds across sources (a person searching and a person watching are
 * two touches), which is why the intent weights above have to carry the
 * honesty: without them, one viral video would outweigh every real buyer in
 * a metro.
 */
export function demandPoints(signals: ReachInput[]): DemandPointsResult {
  let total = 0;
  const contributing: SignalSource[] = [];
  const indexOnly: SignalSource[] = [];
  for (const s of signals) {
    const reach = weeklyReach(s);
    if (reach === null) {
      if (s.value !== null && !indexOnly.includes(s.source)) indexOnly.push(s.source);
      continue;
    }
    total += reach;
    if (!contributing.includes(s.source)) contributing.push(s.source);
  }
  if (contributing.length === 0) {
    return { points: null, reach: null, contributing, indexOnly };
  }
  const reach = Math.round(total);
  return { points: pointsFromReach(reach), reach, contributing, indexOnly };
}

/**
 * A points number said in words, for the caption under the chart. The scale
 * is meaningless to an owner on its own — the reach behind it is not.
 */
export function pointsCaption(result: DemandPointsResult): string | null {
  if (result.points === null || result.reach === null) return null;
  const people =
    result.reach >= 1_000_000
      ? `${(result.reach / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : result.reach >= 1_000
        ? `${(result.reach / 1_000).toFixed(result.reach >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
        : String(result.reach);
  return `${result.points} points — about ${people} weekly touches on this, weighted by how much each one means.`;
}
