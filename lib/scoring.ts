/**
 * Opportunity scoring — the whole formula in one file.
 *
 * TRND answers one question: what should this business advertise next to
 * reach more of the right customers. Four kinds of evidence answer it, and
 * they do not count equally:
 *
 *   score = 0.35 * customer      // what THE target customer is searching
 *                                // and saying, measured where they live —
 *                                // momentum judged against their own words
 *         + 0.30 * brand         // what this business sells, and what has
 *                                // actually worked for it: its past ads,
 *                                // its own posts, then category learnings
 *         + 0.25 * competitive   // what the direct rivals are advertising
 *                                // and posting on it — whitespace is the gap
 *         + 0.10 * cultural      // formats, sounds and short-form momentum.
 *                                // Loud and national: it decides HOW an ad
 *                                // is made far more than WHAT it sells, so
 *                                // it is the smallest weight by design.
 *
 * Every signal is 0..1. A signal with no read at all (no short-form data,
 * no named target customer) is left out and the remaining weights are
 * renormalized — an unknown is not evidence either way. Competition is the
 * exception: unknown competition scores just under neutral, never "open".
 * Fit to the menu then GATES the total (applyRelevance), and evidence gates
 * (sparse, unmeasured, thin volume, national conversation) cap it.
 *
 * The legacy four components (momentum, service match, competitor gap,
 * historical lift) are still computed and kept on the result: the insight
 * lines and meters read them, and they are the raw inputs the signals are
 * built from. The total is the four signals.
 */

import type { Learning, Service, Signal, SignalSeriesPoint, TargetCustomer } from "@/lib/db/types";

/** Above this, a keyword-matched ad count is brand/national noise, not a
 * local read — excluded from scoring and labeled in every surface. */
export const AD_COUNT_LOCAL_MAX = 300;

/** A read below Google's regional meter keeps its fit and its open field,
 * but the total is scaled down so it lands as a B/C idea, never an A wave. */
export const SPARSE_EVIDENCE_GATE = 0.65;

/**
 * A national conversation read is context, not an opportunity.
 *
 * TikTok's industry boards rank whatever is loud across the country that
 * week, measured nowhere near the business. Ungated, those rows outscored
 * every locally-measured term a Chapel Hill coffee shop had: "labor day
 * weekend" came in at grade A on 4,331 national posts while "brown sugar
 * oat latte" — a drink they actually sell, measured in their own state —
 * sat two grades below it. Even when such a term is still ahead of us, a
 * holiday is a TIMING input for an offer, never the offer itself; an ad
 * headlined "Labor Day Weekend" sells nothing.
 *
 * So a national conversation read is capped below the A band. It can still
 * rank, still inform the week's timing, and still appear — it simply cannot
 * outrank demand measured where the customers are.
 */
export const NATIONAL_CONVERSATION_GATE = 0.62;

/** The legacy component weights — still used when a result carries no
 * four-signal read (rows scored before the four-signal model). */
export const WEIGHTS = {
  normalizedDelta: 0.35,
  serviceMatch: 0.25,
  competitorGap: 0.2,
  historicalLift: 0.2,
} as const;

/** The four signal types and how much each decides the recommendation. */
export const SIGNAL_WEIGHTS = {
  customer: 0.35,
  brand: 0.3,
  competitive: 0.25,
  cultural: 0.1,
} as const;
export type SignalKind = keyof typeof SIGNAL_WEIGHTS;

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  customer: "Your customer",
  brand: "Your business",
  competitive: "Your rivals",
  cultural: "Culture",
};

/** delta_pct saturates at +50% w/w; unknown delta sits neutral. */
export function normalizedDelta(deltaPct: number | null): number {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return 0.5;
  return Math.min(1, Math.max(0, deltaPct / 50));
}

/** The 30-day trajectory as a percentage: the last 7 days' mean against the
 * first 7 days'. Null when the series is too short to say. */
export function trendPct(series: Pick<SignalSeriesPoint, "value">[]): number | null {
  if (series.length < 14) return null;
  const mean = (xs: Pick<SignalSeriesPoint, "value">[]) => xs.reduce((a, p) => a + p.value, 0) / xs.length;
  const start = mean(series.slice(0, 7));
  const end = mean(series.slice(-7));
  if (start <= 0) return end > 0 ? 100 : 0;
  // Capped like a Trends "Breakout": past a few hundred percent the number
  // is the first week sitting near zero, not a fact an owner can use.
  return Math.min(TREND_PCT_CAP, ((end - start) / start) * 100);
}
export const TREND_PCT_CAP = 400;

/**
 * Momentum: what the owner sees on the demand line must be what the stars
 * say. A one-week delta alone calls a month-long climb "flat" the week it
 * pauses, and a single spike "hot" — so when a 30-day series exists the
 * weekly read and the month's trajectory carry equal weight.
 */
export function momentum(
  deltaPct: number | null,
  series?: Pick<SignalSeriesPoint, "value">[],
  opts: { sparse?: boolean } = {},
): { score: number; monthPct: number | null; weekPct: number | null } {
  // Sparse = Google measured it and found almost nothing. That is not the
  // "unknown" neutral 0.5 — it is a low read, and the stars say so.
  const week = opts.sparse ? 0.15 : normalizedDelta(deltaPct);
  const monthPct = series ? trendPct(series) : null;
  const weekPct = opts.sparse ? null : deltaPct;
  if (monthPct === null) return { score: week, monthPct: null, weekPct };
  const month = Math.min(1, Math.max(0, monthPct / 50));
  return { score: Math.round((0.5 * week + 0.5 * month) * 1000) / 1000, monthPct, weekPct };
}

/** This week against last, read off a daily series when the signal itself
 * stored no weekly delta (an evergreen watch term, for one). Null when the
 * series is too short to hold two weeks. */
export function weekPctFromSeries(series: Pick<SignalSeriesPoint, "value">[]): number | null {
  if (series.length < 14) return null;
  const mean = (xs: Pick<SignalSeriesPoint, "value">[]) => xs.reduce((a, p) => a + p.value, 0) / xs.length;
  const prev = mean(series.slice(-14, -7));
  const last = mean(series.slice(-7));
  if (prev <= 0) return last > 0 ? 100 : 0;
  return ((last - prev) / prev) * 100;
}

/** A term with no measured weekly movement at all is a sure play, not a
 * wave: its momentum sits below neutral and the total is scaled so it
 * lands as a B, never an A, until a real read arrives. */
export const UNMEASURED_WEEK = 0.3;
export const UNMEASURED_EVIDENCE_GATE = 0.85;

/**
 * A daily series that is mostly zeros is Google failing to resolve the term
 * at this geo, not a month of nothing followed by a wave. "anaerobic
 * natural coffee" in Georgia read 0,0,…,100,0,0 — one sampled day — and
 * `trendPct` turned that into "up 100% across 30 days", which the pick's
 * read then repeated to the owner as the reason to run it. Such a series is
 * flagged sparse and its shape is not read at all.
 */
export const SPARSE_ZERO_SHARE = 0.6;
export function seriesIsSparse(series: Pick<SignalSeriesPoint, "value">[] | undefined): boolean {
  if (!series || series.length < 14) return false;
  return series.filter((p) => p.value <= 0).length / series.length > SPARSE_ZERO_SHARE;
}

/**
 * Searches a month, below which a search-volume read cannot carry a paid
 * campaign on its own: 110 searches a month statewide is a rounding error
 * on a Meta buy, whatever its week-over-week delta says. Such a term is held
 * to the B range and the rationale says why, so a 27% rise on nothing does
 * not outrank a flat 5,400.
 */
export const THIN_VOLUME_MONTHLY = 300;
export const THIN_VOLUME_GATE = 0.72;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "near", "me",
  "at", "vs", "with", "your", "my", "before", "after", "best",
]);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export interface ServiceMatch {
  score: number;
  service: Service | null;
  reason: string;
}

/**
 * Token overlap between the signal term and what the business sells.
 *
 * Weighted, not counted. On a coffee menu the word "coffee" is in a dozen
 * items and says nothing about which one a search means, while "burundi"
 * is in exactly one and says everything. Each shared token is worth more
 * the fewer menu items carry it, and among items sharing the same words the
 * shortest name wins — "Drip Coffee" is what "light roast coffee beans"
 * means on a café menu, not "Fellow Aiden Coffee Brewer", which shared the
 * one word and was matched first for being first in the list, so the
 * campaign for a bean search sold a $400 machine.
 */
export function matchService(signal: Signal, services: Service[]): ServiceMatch {
  const termTokens = tokens(signal.term);
  const active = services.filter((x) => x.is_active);
  // Every word in the name counts for overlap — "Sprotini (Espresso
  // Martini)" is how "espresso martini" gets matched at all. But the
  // parenthetical does not count toward the name's SIZE: "(Small)" and
  // "(12oz)" are qualifiers, and they must not make "Drip Coffee (Small)"
  // look further from "coffee" than a subscription does.
  const serviceTokens = active.map((s) => tokens(s.name + " " + (s.description ?? "")));
  const nameSize = active.map((s) => tokens(s.name.replace(/\([^)]*\)/g, " ")).size);
  // Document frequency: how many menu items carry each word.
  const df = new Map<string, number>();
  for (const set of serviceTokens) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  const weight = (t: string) => 1 / (df.get(t) ?? 1);
  let best: { service: Service; overlap: number; weighted: number; size: number } | null = null;
  active.forEach((s, i) => {
    const shared = [...serviceTokens[i]].filter((t) => termTokens.has(t));
    if (shared.length === 0) return;
    const weighted = shared.reduce((sum, t) => sum + weight(t), 0);
    const size = nameSize[i];
    if (
      !best ||
      weighted > best.weighted + 1e-9 ||
      (Math.abs(weighted - best.weighted) < 1e-9 && size < best.size)
    ) {
      best = { service: s, overlap: shared.length, weighted, size };
    }
  });
  if (best) {
    const b = best as { service: Service; overlap: number };
    return {
      score: Math.min(1, 0.6 + b.overlap * 0.2),
      service: b.service,
      reason: `you already sell ${b.service.name}`,
    };
  }
  // Same category but no direct service line — promotable with a new offer.
  return {
    score: 0.35,
    service: null,
    reason: "no direct service match — this would be a new offer for you",
  };
}

export interface GapInput {
  /** Recent news coverage count for the same term, when we have it. */
  coverageCount: number | null;
  /** Active Meta ads matching the term — the REAL saturation read. */
  adCount?: number | null;
}

export type CompetitorBasis = "ads" | "none";

/** Unknown competition scores as unknown — a hair under neutral, never "open". */
export const GAP_UNKNOWN = 0.55;

/** Inverse of saturation. Few competitors on a rising term = open door.
 * Only a real Meta Ad Library count is a competitor read: a national keyword
 * total says nothing about this owner's block, and local news mentions are
 * context, not rivals — both leave competition UNKNOWN, and the copy says so
 * instead of promising an open field nobody measured. */
export function competitorGap({ coverageCount, adCount }: GapInput): {
  score: number;
  reason: string;
  basis: CompetitorBasis;
} {
  if (typeof adCount === "number" && adCount > AD_COUNT_LOCAL_MAX) {
    return {
      score: GAP_UNKNOWN,
      basis: "none",
      reason: `the Meta read on this is ${adCount} national keyword matches, not a local competitor count — competition scored as unknown`,
    };
  }
  if (typeof adCount === "number") {
    const score = 1 - Math.min(1, adCount / 60);
    const phrase =
      score > 0.66 ? "the field is open" : score > 0.33 ? "some competition already" : "a crowded field";
    return {
      score,
      basis: "ads",
      reason: `${adCount} competitor ad${adCount === 1 ? "" : "s"} running on this near you — ${phrase}`,
    };
  }
  const context =
    typeof coverageCount === "number"
      ? ` (${coverageCount} local news mention${coverageCount === 1 ? "" : "s"} — context, not competition)`
      : "";
  return {
    score: GAP_UNKNOWN,
    basis: "none",
    reason: `no competitor-ad read on this yet — competition scored as unknown, not open${context}`,
  };
}

/** Average lift from learnings for this category; neutral 0.5 when empty. */
export function historicalLift(learnings: Learning[]): { score: number; reason: string } {
  if (learnings.length === 0) {
    return { score: 0.5, reason: "no campaign history on this yet — scored down the middle" };
  }
  const totalWeight = learnings.reduce((s, l) => s + l.sample_size, 0) || learnings.length;
  const avg =
    learnings.reduce((s, l) => s + l.lift * (l.sample_size || 1), 0) / totalWeight;
  const score = Math.min(1, Math.max(0, avg));
  return {
    score,
    reason: `similar angles ran ${score >= 0.6 ? "well" : "unevenly"} for businesses like yours (${learnings.length} past result${learnings.length === 1 ? "" : "s"})`,
  };
}

export type SignalLocality = "metro" | "state" | "national";

/** Demand measured where the business actually is outranks the same demand
 * measured nationally — a small, transparent bonus on the 0..1 total. */
export const LOCALITY_BONUS: Record<SignalLocality, number> = {
  metro: 0.05,
  state: 0.02,
  national: 0,
};

const LOCALITY_TEXT: Record<SignalLocality, string> = {
  metro: "measured in your metro, not nationally",
  state: "measured in your state",
  national: "",
};

export interface ScoredOpportunity {
  score: number; // 0..10, one decimal
  components: {
    normalizedDelta: number;
    serviceMatch: number;
    competitorGap: number;
    historicalLift: number;
  };
  /** 0..0.05 added after the weighted sum; survives applyRelevance. */
  localityBonus: number;
  /** The 30-day trajectory behind the momentum read, when a series existed. */
  monthPct?: number | null;
  /** The weekly movement the momentum read actually used — the signal's own
   * delta, or one derived from its daily series. Null = unmeasured. */
  weekPct?: number | null;
  /** True when no weekly read existed at all (an evergreen term with no
   * series yet) — momentum was scored below neutral and the total gated. */
  unmeasured?: boolean;
  /** What the competitor-gap component was read from. */
  competitorBasis?: CompetitorBasis;
  /** True when the interest read was below Google's regional meter. */
  sparse?: boolean;
  /** True when the term's monthly search volume is too small to carry a
   * paid campaign on its own (see THIN_VOLUME_MONTHLY). */
  thinVolume?: boolean;
  /** Multiplier on the weighted sum (1 = full evidence). A sparse read is an
   * idea that fits, not a measured wave — it cannot outrank real demand. */
  evidenceGate?: number;
  matchedService: Service | null;
  rationale: string;
  competitorGapText: string;
  /** The four signals the total is built from. Absent on results scored
   * before the four-signal model; applyRelevance then uses WEIGHTS. */
  signals?: SignalScores;
  /** One owner-readable line per signal — the "why" behind the grade. */
  signalReasons?: SignalReasons;
  signalInputs?: SignalInputs;
  /** The target-customer phrase this term matched, when one did. */
  audiencePhrase?: string | null;
}

/* ============================ the four signals ============================ */

/** What the named direct rivals are doing on this term. */
export interface RivalTermRead {
  /** Rivals whose ads and posts were actually read. */
  watched: number;
  /** Of those, how many advertise or post on this term. */
  onTerm: number;
  /** Their names, for the "why" line. */
  names: string[];
  /** Rival ads on this term running 21+ days — the proxy for "working". */
  proven: number;
}

/** The short-form read on this term — views momentum, how hard people react. */
export interface CulturalRead {
  platform: string;
  deltaPct: number | null;
  engagementPct: number | null;
  /** Shares + saves per view, TikTok only. */
  actionPct: number | null;
}

/** What has worked for THIS business on this term or angle. */
export interface BrandProof {
  /** 0..1, 0.5 = ran like the account average. */
  lift: number;
  /** How many of their own past ads or posts it rests on. */
  count: number;
  reason: string;
}

export interface FourSignalExtras {
  audience?: TargetCustomer | null;
  rivals?: RivalTermRead | null;
  cultural?: CulturalRead | null;
  /** Their own past ads on this term (lib/ads/history-read historyOnTerm). */
  history?: BrandProof | null;
  /** Their own posts on this term against their usual engagement. */
  ownSocial?: BrandProof | null;
}

export interface SignalScores {
  customer: number;
  brand: number;
  competitive: number;
  /** Null when there is no short-form read — left out of the total. */
  cultural: number | null;
}

export type SignalReasons = Record<SignalKind, string>;

/** Everything applyRelevance needs to rebuild the brand signal with a new fit. */
interface SignalInputs {
  /** Brand's proof half — history, own posts, or learnings. */
  proof: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Does the TARGET customer say this? Momentum on a phrase the person the
 * ads are for would never type is somebody else's demand. Matched against
 * the brief's vocabulary and triggers — their words, not the owner's.
 */
export function audienceMatch(
  term: string,
  audience: TargetCustomer | null | undefined,
): { score: number | null; reason: string; phrase: string | null } {
  if (!audience || audience.vocabulary.length === 0) {
    return { score: null, reason: "", phrase: null };
  }
  const t = term.toLowerCase().trim();
  const termTokens = tokens(t);
  let best = { score: 0.2, phrase: null as string | null };
  const consider = (phrase: string, weight: number) => {
    const p = phrase.toLowerCase().trim();
    if (!p) return;
    let score = 0;
    if (t === p || t.includes(p) || p.includes(t)) score = 1;
    else {
      const shared = [...tokens(p)].filter((x) => termTokens.has(x));
      if (shared.length >= 2) score = 0.85;
      else if (shared.length === 1 && shared[0].length > 4) score = 0.6;
    }
    score *= weight;
    if (score > best.score) best = { score, phrase };
  };
  for (const v of audience.vocabulary) consider(v, 1);
  for (const tr of audience.triggers) consider(tr, 0.85);
  const who = audience.who.split(/[,.;]/)[0].trim();
  const reason =
    best.phrase === null
      ? `not how your target customer talks about what you sell`
      : best.score >= 0.85
        ? `the words your target customer uses ("${best.phrase}")`
        : `close to how your target customer talks ("${best.phrase}")`;
  return { score: round3(best.score), reason: who ? reason : reason, phrase: best.phrase };
}

/** Cultural-source reads: the short-form and national conversation boards. */
export function isCulturalSource(signal: Pick<Signal, "source" | "metric_type">): boolean {
  return (
    signal.metric_type === "shortform_views" ||
    signal.metric_type === "conversation" ||
    signal.source === "youtube" ||
    signal.source === "tiktok" ||
    signal.source === "instagram" ||
    signal.source === "x"
  );
}

/** A cultural read taken from the signal itself, when it is one. */
export function culturalFromSignal(signal: Signal): CulturalRead | null {
  if (!isCulturalSource(signal)) return null;
  const raw = (signal.raw ?? {}) as { engagementPct?: unknown; actionPct?: unknown };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    platform: signal.source,
    deltaPct: signal.delta_pct,
    engagementPct: num(raw.engagementPct),
    actionPct: num(raw.actionPct),
  };
}

export function culturalSignal(read: CulturalRead | null | undefined): { score: number | null; reason: string } {
  if (!read) return { score: null, reason: "" };
  const platform = read.platform === "youtube" ? "Shorts" : read.platform === "tiktok" ? "TikTok" : read.platform === "instagram" ? "Reels" : read.platform === "x" ? "X" : read.platform;
  const moving = read.deltaPct === null ? 0.5 : clamp01(read.deltaPct / 50);
  const engaged =
    read.engagementPct === null ? 0.5 : read.engagementPct >= 4 ? 1 : read.engagementPct < 1.5 ? 0.2 : 0.55;
  const acted = typeof read.actionPct === "number" && read.actionPct >= 1 ? 0.1 : 0;
  const score = round3(clamp01(0.6 * moving + 0.4 * engaged + acted));
  const reason =
    read.deltaPct === null
      ? `${platform} is posting about it`
      : `${platform} views on it ${read.deltaPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(read.deltaPct))}%${
          read.engagementPct !== null && read.engagementPct >= 4 ? ", and people are reacting" : ""
        }`;
  return { score, reason };
}

/**
 * Whitespace among the rivals that matter. A market-wide ad count says how
 * crowded the keyword is; the named direct rivals say whether the people a
 * customer would actually compare you against are already saying it.
 */
export function competitiveSignal(
  gap: { score: number; basis: CompetitorBasis; reason: string },
  rivals: RivalTermRead | null | undefined,
): { score: number; reason: string } {
  if (!rivals || rivals.watched < 2) return { score: gap.score, reason: gap.reason };
  const share = rivals.onTerm / rivals.watched;
  const whitespace = clamp01(1 - share - 0.1 * rivals.proven);
  const score = round3(gap.basis === "ads" ? 0.5 * gap.score + 0.5 * whitespace : 0.8 * whitespace + 0.2 * gap.score);
  const reason =
    rivals.onTerm === 0
      ? `none of your ${rivals.watched} direct rivals is advertising or posting on this`
      : `${rivals.onTerm} of your ${rivals.watched} direct rivals ${rivals.onTerm === 1 ? "is" : "are"} on this (${rivals.names.slice(0, 2).join(", ")})${
          rivals.proven > 0 ? `, ${rivals.proven} with an ad that has run three weeks or more` : ""
        }`;
  return { score, reason };
}

/**
 * Brand = fit to what they sell, plus proof it has worked for them. Fit
 * carries most of it: proof is neutral for most businesses most weeks, and
 * a flat term squarely on the menu must still beat a small rise on a term
 * that shares one word with it.
 */
export const BRAND_FIT_SHARE = 0.7;
export function brandSignal(fit: number, proof: number): number {
  return round3(clamp01(BRAND_FIT_SHARE * fit + (1 - BRAND_FIT_SHARE) * proof));
}

/** Weighted total over the signals that exist, renormalized. */
export function combineSignals(s: SignalScores): number {
  let sum = 0;
  let weight = 0;
  for (const k of Object.keys(SIGNAL_WEIGHTS) as SignalKind[]) {
    const v = s[k];
    if (v === null) continue;
    sum += SIGNAL_WEIGHTS[k] * v;
    weight += SIGNAL_WEIGHTS[k];
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * Fold in the snapshot-aware relevance judgment. The fit component becomes
 * the judged relevance, and — unlike the additive first pass — fit GATES the
 * total: momentum on a trend this business shouldn't touch is not an
 * opportunity, so the weighted sum is scaled by (0.3 + 0.7 × fit). A perfect
 * fit changes nothing; "completely outside your business" lands in the C
 * range no matter how hard the trend is rising.
 */
export function applyRelevance(
  result: ScoredOpportunity,
  relevance: number,
  reason: string,
  label = "Snapshot read",
): ScoredOpportunity {
  const fit = Math.min(1, Math.max(0, relevance));
  const c = result.components;
  const signals =
    result.signals && result.signalInputs
      ? { ...result.signals, brand: brandSignal(fit, result.signalInputs.proof) }
      : undefined;
  const weighted = signals
    ? combineSignals(signals)
    : WEIGHTS.normalizedDelta * c.normalizedDelta +
      WEIGHTS.serviceMatch * fit +
      WEIGHTS.competitorGap * c.competitorGap +
      WEIGHTS.historicalLift * c.historicalLift;
  const total = Math.min(1, weighted * (0.3 + 0.7 * fit) * (result.evidenceGate ?? 1) + result.localityBonus);
  return {
    ...result,
    score: Math.round(total * 100) / 10,
    signals,
    components: { ...c, serviceMatch: fit },
    // A "matched service" claim under an irrelevant term reads as nonsense.
    matchedService: fit < 0.3 ? null : result.matchedService,
    rationale: `${result.rationale} ${label}: ${reason}`,
  };
}

export function scoreOpportunity(
  signal: Signal,
  services: Service[],
  learnings: Learning[],
  gap: GapInput,
  opts: {
    locality?: SignalLocality;
    series?: Pick<SignalSeriesPoint, "value">[];
  } & FourSignalExtras = {},
): ScoredOpportunity {
  // Sparse by the adapter's own flag, or by the shape of the series it left
  // behind — a mostly-zero line is the same fact seen from the other side.
  const sparseSeries = seriesIsSparse(opts.series);
  const sparse = (signal.raw as { sparse?: boolean } | null | undefined)?.sparse === true || sparseSeries;
  // A sparse series has no shape worth reading: its "trend" is one sampled
  // day against a floor of zeros.
  const series = sparseSeries ? undefined : opts.series;
  // No stored weekly delta: read this week off the daily series when one
  // exists; otherwise the week is unmeasured, and scored as such.
  const seriesWeek =
    signal.delta_pct === null && !sparse && series ? weekPctFromSeries(series) : null;
  const weekInput = signal.delta_pct ?? seriesWeek;
  const unmeasured = !sparse && weekInput === null;
  // A signal with its own measured delta (search volume month over month)
  // keeps it even when Trends could not chart the term: sparse then gates
  // the total but does not erase a number another source measured.
  const ownDelta = sparse && typeof signal.delta_pct === "number" && signal.metric_type === "search_volume";
  const mo = ownDelta ? momentum(signal.delta_pct, undefined) : momentum(weekInput, series, { sparse });
  const thinVolume =
    signal.metric_type === "search_volume" &&
    typeof signal.value === "number" &&
    signal.value > 0 &&
    signal.value < THIN_VOLUME_MONTHLY;
  if (unmeasured) {
    const month = typeof mo.monthPct === "number" ? Math.min(1, Math.max(0, mo.monthPct / 50)) : null;
    mo.score = month === null ? UNMEASURED_WEEK : Math.round((0.5 * UNMEASURED_WEEK + 0.5 * month) * 1000) / 1000;
  }
  const nd = mo.score;
  // National conversation (the TikTok industry board) is measured for the
  // whole country, so it cannot describe this business's town.
  const nationalConversation =
    signal.metric_type === "conversation" && !/^[A-Z]{2}-/.test(signal.geo);
  const baseGate = nationalConversation
    ? NATIONAL_CONVERSATION_GATE
    : sparse
      ? SPARSE_EVIDENCE_GATE
      : unmeasured
        ? UNMEASURED_EVIDENCE_GATE
        : 1;
  const evidenceGate = thinVolume ? Math.min(baseGate, THIN_VOLUME_GATE) : baseGate;
  const sm = matchService(signal, services);
  const cg = competitorGap(gap);
  const hl = historicalLift(learnings);
  const locality = opts.locality ?? "national";
  const localityBonus = LOCALITY_BONUS[locality];

  // ---- the four signals
  // A short-form or national-board read is cultural evidence, and it already
  // counts at the cultural weight. Its momentum says little about whether
  // THIS business's customer wants the thing, so only a quarter of it
  // reaches the customer signal; the rest is pulled to neutral. Without
  // this, a +200% TikTok read with no search behind it outranked a +40%
  // search rise on the same menu.
  const cultural = opts.cultural ?? culturalFromSignal(signal);
  const culturalScore = culturalSignal(cultural);
  const customerMomentum = isCulturalSource(signal) ? round3(0.25 * nd + 0.375) : nd;
  const aud = audienceMatch(signal.term, opts.audience);
  const customer = round3(aud.score === null ? customerMomentum : 0.65 * customerMomentum + 0.35 * aud.score);
  const competitive = competitiveSignal(cg, opts.rivals);
  // Proof, best evidence first: this business's own past ads on the term,
  // then its own posts on it, then what similar businesses' results say.
  const proofSource =
    opts.history && opts.history.count > 0
      ? opts.history
      : opts.ownSocial && opts.ownSocial.count > 0
        ? opts.ownSocial
        : null;
  const proof = proofSource ? proofSource.lift : hl.score;
  const signals: SignalScores = {
    customer,
    brand: brandSignal(sm.score, proof),
    competitive: competitive.score,
    cultural: culturalScore.score,
  };

  const total = Math.min(1, combineSignals(signals) * evidenceGate + localityBonus);

  const monthText =
    typeof mo.monthPct === "number"
      ? ` and ${mo.monthPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(mo.monthPct))}% across 30 days`
      : "";
  const metricText = signal.metric_type.replace(/_/g, " ");
  const evergreen = signal.source === "snapshot";
  const volumeText = thinVolume
    ? ` — about ${Math.round(Number(signal.value))} searches a month in ${signal.geo}, too few to carry a paid campaign on their own`
    : "";
  const deltaText = sparse && !ownDelta
    ? `too small for Google's meter in ${signal.geo} — an idea that fits, not a measured wave${volumeText}`
    : sparse && typeof mo.weekPct === "number"
      ? `${mo.weekPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(mo.weekPct))}% ${metricText} this month, though too small for Google's daily meter in ${signal.geo}${volumeText}`
    : typeof mo.weekPct === "number"
      ? `${mo.weekPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(mo.weekPct))}% ${evergreen ? "search interest" : metricText} this week${monthText}${volumeText}`
      : evergreen
        ? `a year-round search term for what you sell — no weekly read yet, so momentum is scored conservatively${monthText}`
        : `showing ${metricText} right now — no weekly read yet, so momentum is scored conservatively${monthText}`;
  const localityText = LOCALITY_TEXT[locality] ? ` (${LOCALITY_TEXT[locality]})` : "";

  const signalReasons: SignalReasons = {
    customer: [deltaText, aud.reason].filter(Boolean).join("; "),
    brand: [sm.reason, proofSource ? proofSource.reason : hl.reason].join("; "),
    competitive: competitive.reason,
    cultural: culturalScore.reason || "no short-form read on this yet",
  };
  const extraText = [
    aud.score !== null ? aud.reason : "",
    opts.rivals && opts.rivals.watched >= 2 ? competitive.reason : "",
    proofSource ? proofSource.reason : "",
    opts.cultural && culturalScore.reason ? culturalScore.reason : "",
  ].filter(Boolean);

  return {
    score: Math.round(total * 100) / 10,
    signals,
    signalReasons,
    signalInputs: { proof },
    audiencePhrase: aud.phrase,
    components: {
      normalizedDelta: nd,
      serviceMatch: sm.score,
      competitorGap: cg.score,
      historicalLift: hl.score,
    },
    localityBonus,
    monthPct: mo.monthPct,
    weekPct: mo.weekPct,
    unmeasured,
    sparse,
    thinVolume,
    evidenceGate,
    competitorBasis: cg.basis,
    matchedService: sm.service,
    rationale: `"${signal.term}" is ${deltaText}${localityText}; ${sm.reason}; ${cg.reason}; ${proofSource ? proofSource.reason : hl.reason}${
      extraText.length > 0 ? `; ${extraText.filter((t) => t !== (proofSource?.reason ?? "")).join("; ")}` : ""
    }.`,
    competitorGapText: cg.reason,
  };
}
