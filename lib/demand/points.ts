import type { SignalSource } from "@/lib/db/types";
import type { GeoLevel } from "@/lib/signals/geo";

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

/**
 * The bottom of the scale.
 *
 * Calibrated for the businesses this is for. At ten a week, a local term
 * with thirty searches a month — a genuine niche for a coffee roaster —
 * floored to zero and drew a line flat along the axis for eight weeks, so
 * the bottom of an SMB's actual range was discarded as "no market". Two a
 * week is the honest floor: below that there is nothing to advertise into.
 */
const REACH_FLOOR = 2;
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
  // A like or comment on a Reel is a deliberate act, not an impression:
  // somebody stopped and touched it. That sits between being shown a video
  // (0.02) and writing a post (0.6). Instagram reports no impression count
  // to us at all — only reactions on a sample — so this weight is applied
  // to reactions, never to a Reel count, which saturates at the page size.
  instagram: 0.15,
  // A post on X is written, not watched — closer to a Reddit thread than to
  // a video impression. Rarer and more deliberate, so it counts for more.
  x: 0.6,
  reddit: 0.6,
  news: 0.5,
};

/** Weeks in a month, for turning monthly search volume into a weekly rate. */
const WEEKS_PER_MONTH = 4.345;

/**
 * How much a read counts, by where it was measured.
 *
 * The formula had no geography in it at all: `weeklyReach` looked at source,
 * metric and value and never at `geo`, so a globally-measured X post and an
 * NC-scoped search were summed as equals. Three of the five live surfaces
 * (YouTube, the TikTok board, X) are national or global, which meant the
 * composite quietly treated 330 million people and sixty thousand as the
 * same market. Measured on two real reads for one Chapel Hill café, global
 * chatter about "brunch" scored 56 points while in-market searches for the
 * thing they actually sell scored 34.
 *
 * It also contradicted the grade, which has always known better —
 * `LOCALITY_BONUS` in lib/scoring.ts rewards a metro read over a national
 * one. The graph the owner looks at now agrees with the letter beside it.
 *
 * These are not population ratios. A metro is a fraction of a percent of the
 * country, and weighting by that would zero national attention out
 * entirely — but national attention genuinely does lead local demand by a
 * week or two, so it keeps a floor. It counts as a leading indicator, not
 * as this week's customers.
 */
export const LOCALITY_WEIGHT: Record<GeoLevel, number> = {
  metro: 1,
  state: 0.6,
  // Not a population share — a state is roughly 3% of the country, and
  // weighting by that would delete national attention from a formula where
  // it is the earliest warning available. But national counts routinely run
  // ten to a hundred times larger than a local one, so anything near 0.15
  // lets raw national volume win every comparison on size alone. 0.05 keeps
  // it as a leading indicator that can add to a local read without
  // outvoting it.
  national: 0.05,
};

export interface ReachInput {
  source: SignalSource;
  metricType: string;
  /** The signal's stored value, in whatever unit the source speaks. */
  value: number | null;
  /**
   * Where the read was taken, relative to the business. Omitted means
   * "don't weight by geography" — used by callers that have already
   * resolved it, and by tests measuring the intent weights alone.
   */
  locality?: GeoLevel;
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
export function weeklyReach({ source, metricType, value, locality }: ReachInput): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const intent = INTENT_WEIGHT[source];
  if (intent === undefined) return null;
  const weight = intent * (locality ? LOCALITY_WEIGHT[locality] : 1);

  switch (metricType) {
    case "search_volume":
      // Google Ads keyword data is monthly; the product speaks in weeks.
      return (value / WEEKS_PER_MONTH) * weight;
    case "shortform_views":
      // Already a 7-day figure from both short-form adapters.
      return value * weight;
    case "conversation":
    case "posts":
      return value * weight;
    case "reel_reactions":
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

/**
 * How much is actually behind a number.
 *
 * A term read once by one national source scored identically to one read by
 * five sources across eight weeks, which is how a guess ends up sitting
 * beside a measurement wearing the same face. The points stay honest and
 * absolute — distorting them would break the comparability they exist for —
 * and this travels alongside so a screen can say which kind of number it is.
 */
export type DemandConfidence = "thin" | "fair" | "solid";

export interface DemandPointsResult {
  /** 0–100, or null when nothing measurable contributed. */
  points: number | null;
  /** Estimated people-equivalents per week behind the points. */
  reach: number | null;
  /** Which sources actually contributed, for the "how we got this" line. */
  contributing: SignalSource[];
  /** Sources present but unusable because they are self-relative indices. */
  indexOnly: SignalSource[];
  confidence: DemandConfidence;
  /** The closest to home any contributing read was taken. */
  closest: GeoLevel | null;
}

/**
 * Two things make a read trustworthy: more than one surface saw it, and at
 * least one saw it near the business. Either alone is fair; both is solid;
 * neither is thin, however big the number.
 */
export function confidenceFor(
  contributing: SignalSource[],
  closest: GeoLevel | null,
): DemandConfidence {
  const inMarket = closest === "metro" || closest === "state";
  if (contributing.length >= 2 && inMarket) return "solid";
  if (contributing.length >= 2 || inMarket) return "fair";
  return "thin";
}

/**
 * Every read TRND holds on one term this week → a single comparable number.
 *
 * Reach adds across sources (a person searching and a person watching are
 * two touches), which is why the intent weights above have to carry the
 * honesty: without them, one viral video would outweigh every real buyer in
 * a metro.
 */
const CLOSER: Record<GeoLevel, number> = { metro: 3, state: 2, national: 1 };

export function demandPoints(signals: ReachInput[]): DemandPointsResult {
  let total = 0;
  const contributing: SignalSource[] = [];
  const indexOnly: SignalSource[] = [];
  let closest: GeoLevel | null = null;
  for (const s of signals) {
    const reach = weeklyReach(s);
    if (reach === null) {
      if (s.value !== null && !indexOnly.includes(s.source)) indexOnly.push(s.source);
      continue;
    }
    total += reach;
    if (!contributing.includes(s.source)) contributing.push(s.source);
    if (s.locality && (!closest || CLOSER[s.locality] > CLOSER[closest])) closest = s.locality;
  }
  if (contributing.length === 0) {
    return {
      points: null, reach: null, contributing, indexOnly,
      confidence: "thin", closest: null,
    };
  }
  const reach = Math.round(total);
  return {
    points: pointsFromReach(reach),
    reach,
    contributing,
    indexOnly,
    confidence: confidenceFor(contributing, closest),
    closest,
  };
}

/**
 * A points number said in words, for the caption under the chart. The scale
 * is meaningless to an owner on its own — the reach behind it is not.
 */
const CONFIDENCE_NOTE: Record<DemandConfidence, string> = {
  solid: "",
  fair: " Read on one surface, or only outside your area — treat it as a lead, not a count.",
  thin: " Only one national read stands behind this — the weakest kind of evidence TRND holds.",
};

export function pointsCaption(result: DemandPointsResult): string | null {
  if (result.points === null || result.reach === null) return null;
  const people =
    result.reach >= 1_000_000
      ? `${(result.reach / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : result.reach >= 1_000
        ? `${(result.reach / 1_000).toFixed(result.reach >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
        : String(result.reach);
  return (
    `${result.points} points — about ${people} weekly touches on this, weighted by how much each one means and how close to you it was measured.` +
    CONFIDENCE_NOTE[result.confidence]
  );
}
