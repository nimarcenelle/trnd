/**
 * The four-signal scoring model (founder spec, 2026-09-13).
 *
 * Customer, Culture, Competitive and Brand each produce a 0-100 score with a
 * confidence. They combine into an Opportunity Grade.
 *
 * Two rules hold everywhere:
 * 1. Score relative, not absolute. A reading is a percentile rank against a
 *    rolling baseline for this brand (and, for Culture and Competitive, its
 *    category): 100 is the strongest reading we have seen recently.
 * 2. Score with a confidence, not a fake number. Thin or missing data is
 *    marked low confidence. A low-confidence signal is left out of the grade
 *    and its weight goes to the others; it is never averaged in as a
 *    credible-looking 50.
 *
 * This file is the contract: shapes, weights, bands, and the combination.
 * Each signal's own scorer lives beside it (customer.ts, culture.ts,
 * competitive.ts, brand.ts) and returns a SignalScore.
 */

export type Confidence = "high" | "medium" | "low";
export type SignalName = "customer" | "culture" | "competitive" | "brand";
export const SIGNAL_ORDER: SignalName[] = ["customer", "culture", "competitive", "brand"];

export const SIGNAL_LABELS: Record<SignalName, string> = {
  customer: "Customer",
  culture: "Culture",
  competitive: "Competitive",
  brand: "Brand",
};

/** Default weights, used when every signal is medium confidence or better. */
export const SIGNAL_WEIGHTS_V1: Record<SignalName, number> = {
  customer: 35,
  brand: 25,
  culture: 20,
  competitive: 20,
};

/** Suggested starting sub-weights inside each signal. */
export const SUB_WEIGHTS = {
  customer: { volume: 40, intent: 35, velocity: 25 },
  culture: { growth: 40, seasonal: 30, lifecycle: 30 },
  competitive: { whitespace: 45, saturation: 30, weakness: 25 },
  brand: { similarity: 40, economics: 30, organic: 30 },
} as const;

/** The score a low-confidence signal carries for display. It never counts. */
export const NEUTRAL_PLACEHOLDER = 50;

/** Fewer baseline readings than this and a percentile is noise. */
export const MIN_BASELINE = 8;

export interface SignalComponent {
  key: string;
  label: string;
  /** Sub-weight, 0-100. */
  weight: number;
  /** 0-100, or null when this component had no data; its weight is then
   * spread over the components that did. */
  score: number | null;
  /** One owner-readable line on what the component read. */
  detail?: string;
}

export interface SignalScore {
  signal: SignalName;
  /** 0-100. A low-confidence signal carries NEUTRAL_PLACEHOLDER and is excluded. */
  score: number;
  confidence: Confidence;
  components: SignalComponent[];
  /** Owner-facing, shown when confidence is low: "No competitors connected yet". */
  note: string | null;
  /** Where to fix the gap, when the owner can: connect competitors, import ads. */
  cta: { label: string; href: string } | null;
}

export type GradeLetter = "A+" | "A" | "B+" | "B" | "C" | "Hold";

export const GRADE_BANDS: { min: number; letter: GradeLetter; meaning: string }[] = [
  { min: 90, letter: "A+", meaning: "Standout. Rare, drop everything" },
  { min: 80, letter: "A", meaning: "Strong, clear go" },
  { min: 70, letter: "B+", meaning: "Good, worth running" },
  { min: 60, letter: "B", meaning: "Reasonable, not urgent" },
  { min: 50, letter: "C", meaning: "Marginal. Hold unless nothing better is available" },
  { min: 0, letter: "Hold", meaning: "Don't build a campaign yet" },
];

export interface OpportunityGrade {
  /** 0-100, one decimal. */
  score: number;
  grade: GradeLetter;
  meaning: string;
  /** True for the Hold band: never recommend building a campaign. */
  hold: boolean;
  signals: Record<SignalName, SignalScore>;
  /** The weights actually used, renormalized to 100 over included signals. */
  weightsUsed: Record<SignalName, number>;
  /** Signals left out for low confidence. */
  excluded: SignalName[];
  /** Owner-facing: "Competitive wasn't factored in: no competitors connected yet." */
  notes: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function gradeForScore(score: number): { letter: GradeLetter; meaning: string; hold: boolean } {
  const s = clamp(score);
  const band = GRADE_BANDS.find((b) => s >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  return { letter: band.letter, meaning: band.meaning, hold: band.letter === "Hold" };
}

/**
 * Where a reading falls against a trailing baseline, 0-100 (share of
 * baseline readings at or below it, ties counted half). Null when the
 * baseline is too thin to rank against: the caller falls back to an absolute
 * curve and caps its confidence.
 */
export function percentileRank(value: number, baseline: number[], min = MIN_BASELINE): number | null {
  const xs = baseline.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(value) || xs.length < min) return null;
  let below = 0;
  let equal = 0;
  for (const v of xs) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return round1(clamp(((below + equal / 2) / xs.length) * 100));
}

/** Weighted mean of the components that have data, their weights renormalized.
 * Null when none do. */
export function weightedComponents(components: SignalComponent[]): number | null {
  const known = components.filter((c) => typeof c.score === "number" && Number.isFinite(c.score));
  const weight = known.reduce((s, c) => s + c.weight, 0);
  if (known.length === 0 || weight <= 0) return null;
  return round1(clamp(known.reduce((s, c) => s + c.weight * (c.score as number), 0) / weight));
}

/** Assemble a SignalScore from components and a confidence; a low-confidence
 * signal carries the neutral placeholder instead of a computed number. */
export function signalScore(
  signal: SignalName,
  components: SignalComponent[],
  confidence: Confidence,
  extras: { note?: string | null; cta?: SignalScore["cta"] } = {},
): SignalScore {
  const computed = weightedComponents(components);
  const effective: Confidence = computed === null ? "low" : confidence;
  return {
    signal,
    score: effective === "low" || computed === null ? NEUTRAL_PLACEHOLDER : computed,
    confidence: effective,
    components,
    note: extras.note ?? null,
    cta: extras.cta ?? null,
  };
}

/**
 * The Opportunity Grade. Signals with medium or high confidence are combined
 * with the default weights, renormalized over the ones included; a
 * low-confidence signal's weight is redistributed proportionally and it gets
 * a visible note instead of a silent penalty. With nothing above low
 * confidence there is nothing honest to grade: Hold.
 */
export function combineSignals(
  signals: Record<SignalName, SignalScore>,
  weights: Record<SignalName, number> = SIGNAL_WEIGHTS_V1,
): OpportunityGrade {
  const included = SIGNAL_ORDER.filter((s) => signals[s].confidence !== "low");
  const excluded = SIGNAL_ORDER.filter((s) => signals[s].confidence === "low");
  const total = included.reduce((s, name) => s + weights[name], 0);
  const weightsUsed = Object.fromEntries(
    SIGNAL_ORDER.map((name) => [name, included.includes(name) && total > 0 ? round1((weights[name] / total) * 100) : 0]),
  ) as Record<SignalName, number>;

  const notes = excluded.map((name) => {
    const why = signals[name].note?.trim().replace(/\.$/, "");
    return `${SIGNAL_LABELS[name]} wasn't factored in${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ""}.`;
  });

  if (included.length === 0 || total <= 0) {
    const g = gradeForScore(0);
    return { score: 0, grade: g.letter, meaning: g.meaning, hold: true, signals, weightsUsed, excluded, notes };
  }
  const score = round1(clamp(included.reduce((s, name) => s + weights[name] * signals[name].score, 0) / total));
  const g = gradeForScore(score);
  return { score, grade: g.letter, meaning: g.meaning, hold: g.hold, signals, weightsUsed, excluded, notes };
}

/* ------------------------------ signal inputs ------------------------------ */
// What each scorer receives. Gathering them from the database is the ranking
// job's work; the scorers are pure.

export type IntentKind = "pain_point" | "purchase_intent" | "complaint" | "curiosity" | "unrelated";

export interface DailyPoint {
  day: string; // yyyy-mm-dd
  value: number;
}

/** What a volume level counts. 14,800 monthly searches, a Trends index of
 * 63 and 471 short-form views are three scales; the absolute fallback (used
 * until a baseline exists) needs to know which it is looking at. */
export type LevelKind = "search_volume" | "search_interest" | "shortform_views" | "conversation" | "index";

export interface CustomerInput {
  term: string;
  /** How closely the term is this brand's persona talking, 0-1; null when no
   * persona has been derived. */
  personaMatch: number | null;
  /** Where the persona came from, strongest first. */
  personaSource: "orders" | "engagement" | "brief" | null;
  /** This week's volume reading for the term (searches, mentions, views). */
  level: number | null;
  /** What `level` counts. Defaults to search volume. */
  levelKind?: LevelKind;
  /** Shares and saves per view on this term's short-form this month, as a
   * percent: the truest sign a post made someone act. Null when unread. */
  actionPct?: number | null;
  /** Trailing 90 days of this brand's persona-matched volume readings. */
  levelBaseline: number[];
  /** Social activity from the persona group on this term: mentions, comments,
   * autocomplete phrasings, community post titles. `kind` when already
   * classified. */
  activity: { text: string; kind?: IntentKind }[];
  /** Daily series for the term, up to 90 days, oldest first. */
  series: DailyPoint[];
}

export type LifecycleStage = "emerging" | "growing" | "peaking" | "declining" | "flat";

export interface CultureInput {
  term: string;
  category: string;
  /** Category-wide volume growth this period, percent; null when unread. */
  categoryGrowthPct: number | null;
  /** What the category growth was read from: a year of search volume across
   * the category's terms, or this week's moves. Defaults to "week". */
  categoryGrowthBasis?: "year" | "week";
  /** The term's own searches, the last three complete months against the
   * same three a year earlier, percent; null under a year of history. */
  yearOverYearPct?: number | null;
  /** Trailing 90 days of this category's growth readings. */
  categoryGrowthBaseline: number[];
  /** Is this historically the active window for the term or its category.
   * `fit` (0-100) is set when a year of the term's own history answered
   * that; otherwise the category calendar's window and distance do. */
  seasonal: { inWindow: boolean; daysOut: number | null; label: string | null; fit?: number | null } | null;
  /** Daily series for the term or its category, up to 90 days, oldest first. */
  series: DailyPoint[];
}

export interface CompetitiveInput {
  /** Competitors in the brand's active set (Settings, or inferred). */
  competitorsConnected: number;
  /** Of those, how many have ads or posts that were actually read. */
  competitorsRead: number;
  /** Posts and distinct ads read across those rivals: how much stands
   * behind the whitespace call. Defaults to enough when not given. */
  evidenceItems?: number;
  /** Competitors running this exact angle now (last 14 days). */
  rivalsOnAngleNow: number;
  /** Competitors running it in the prior window (15-45 days ago); null when unread. */
  rivalsOnAnglePrior: number | null;
  /** Their ads on this angle, and how many of those look weak: pulled inside a
   * week, or engagement well under the rival's own median. */
  rivalAdsOnAngle: number;
  weakRivalAds: number;
  /** Where the owner connects competitors. */
  settingsHref: string;
}

export interface BrandInput {
  /** The brand's own paid ads on record (imports, synced accounts, runs). */
  adHistoryAds: number;
  /** Past ads resembling this opportunity (term, hook type, format, offer). */
  similarAdsCount: number;
  /** Their CTR (or ROAS when known) against the account average, as a ratio;
   * null when there are no similar ads with enough delivery. */
  similarAdsLift: number | null;
  /** Trailing lift ratios of this brand's past ads, for the percentile. */
  liftBaseline: number[];
  economics: {
    /** Judged fit of the opportunity to the catalog, 0-1. */
    fit: number | null;
    /** Does the item's price sit in the brand's price band. */
    priceBandMatch: boolean | null;
    inStock: boolean | null;
    marginOk: boolean | null;
  };
  organic: {
    /** Own posts read recently. */
    posts: number;
    /** Own posts on this opportunity. */
    onTermPosts: number;
    /** Their engagement against the brand's own median, as a ratio. */
    engagementRatio: number | null;
  };
  /** Where the owner imports ad history or connects an ad account. */
  settingsHref: string;
}
