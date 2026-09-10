/**
 * Opportunity scoring — the whole formula in one file, per the brief:
 *
 *   score = 0.35 * momentum           // how fast it's rising: this week vs
 *                                     // last, blended with the 30-day line
 *         + 0.25 * service_match      // does this business already sell it
 *         + 0.20 * competitor_gap     // inverse of local ad saturation (proxy)
 *         + 0.20 * historical_lift    // from `learnings`, 0.5 neutral when empty
 *
 * Every component is 0..1; the total is rendered as 0–10 with one decimal.
 * A number with no explanation is exactly the "dashboard of mentions" TRND
 * refuses to be — buildRationale() turns the components into plain English.
 */

import type { Learning, Service, Signal, SignalSeriesPoint } from "@/lib/db/types";

/** Above this, a keyword-matched ad count is brand/national noise, not a
 * local read — excluded from scoring and labeled in every surface. */
export const AD_COUNT_LOCAL_MAX = 300;

/** A read below Google's regional meter keeps its fit and its open field,
 * but the total is scaled down so it lands as a B/C idea, never an A wave. */
export const SPARSE_EVIDENCE_GATE = 0.65;

export const WEIGHTS = {
  normalizedDelta: 0.35,
  serviceMatch: 0.25,
  competitorGap: 0.2,
  historicalLift: 0.2,
} as const;

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
  return ((end - start) / start) * 100;
}

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
): { score: number; monthPct: number | null } {
  // Sparse = Google measured it and found almost nothing. That is not the
  // "unknown" neutral 0.5 — it is a low read, and the stars say so.
  const week = opts.sparse ? 0.15 : normalizedDelta(deltaPct);
  const monthPct = series ? trendPct(series) : null;
  if (monthPct === null) return { score: week, monthPct: null };
  const month = Math.min(1, Math.max(0, monthPct / 50));
  return { score: Math.round((0.5 * week + 0.5 * month) * 1000) / 1000, monthPct };
}

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

/** Token overlap between the signal term and what the business sells. */
export function matchService(signal: Signal, services: Service[]): ServiceMatch {
  const termTokens = tokens(signal.term);
  let best: { service: Service; overlap: number } | null = null;
  for (const s of services.filter((x) => x.is_active)) {
    const overlap = [...tokens(s.name + " " + (s.description ?? ""))].filter((t) =>
      termTokens.has(t),
    ).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { service: s, overlap };
  }
  if (best) {
    return {
      score: Math.min(1, 0.6 + best.overlap * 0.2),
      service: best.service,
      reason: `you already sell ${best.service.name}`,
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

/** Inverse of saturation. Few competitors on a rising term = open door.
 * A real Meta Ad Library count beats the news-coverage proxy. */
export function competitorGap({ coverageCount, adCount }: GapInput): { score: number; reason: string } {
  // A national keyword total says nothing about this owner's block — fall
  // through to the news read rather than scoring phantom competition.
  if (typeof adCount === "number" && adCount > AD_COUNT_LOCAL_MAX) adCount = null;
  if (typeof adCount === "number") {
    const score = 1 - Math.min(1, adCount / 60);
    const phrase =
      score > 0.66 ? "the field is open" : score > 0.33 ? "some competition already" : "a crowded field";
    return {
      score,
      reason: `${adCount} competitor ad${adCount === 1 ? "" : "s"} running on this near you — ${phrase}`,
    };
  }
  if (coverageCount === null) {
    return { score: 0.6, reason: "few competitors seem to be on this yet (estimated — no direct ad read)" };
  }
  const score = 1 - Math.min(1, coverageCount / 15);
  const reason =
    score > 0.66
      ? `hardly any local buzz on this yet (${coverageCount} news mention${coverageCount === 1 ? "" : "s"}) — room to own it`
      : score > 0.33
        ? `some local buzz already (${coverageCount} news mentions)`
        : `this is all over local news (${coverageCount} mentions) — crowded`;
  return { score, reason };
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
  /** True when the interest read was below Google's regional meter. */
  sparse?: boolean;
  /** Multiplier on the weighted sum (1 = full evidence). A sparse read is an
   * idea that fits, not a measured wave — it cannot outrank real demand. */
  evidenceGate?: number;
  matchedService: Service | null;
  rationale: string;
  competitorGapText: string;
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
  const weighted =
    WEIGHTS.normalizedDelta * c.normalizedDelta +
    WEIGHTS.serviceMatch * fit +
    WEIGHTS.competitorGap * c.competitorGap +
    WEIGHTS.historicalLift * c.historicalLift;
  const total = Math.min(1, weighted * (0.3 + 0.7 * fit) * (result.evidenceGate ?? 1) + result.localityBonus);
  return {
    ...result,
    score: Math.round(total * 100) / 10,
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
  opts: { locality?: SignalLocality; series?: Pick<SignalSeriesPoint, "value">[] } = {},
): ScoredOpportunity {
  const sparse = (signal.raw as { sparse?: boolean } | null | undefined)?.sparse === true;
  const mo = momentum(signal.delta_pct, opts.series, { sparse });
  const nd = mo.score;
  const evidenceGate = sparse ? SPARSE_EVIDENCE_GATE : 1;
  const sm = matchService(signal, services);
  const cg = competitorGap(gap);
  const hl = historicalLift(learnings);
  const locality = opts.locality ?? "national";
  const localityBonus = LOCALITY_BONUS[locality];

  const total = Math.min(
    1,
    (WEIGHTS.normalizedDelta * nd +
      WEIGHTS.serviceMatch * sm.score +
      WEIGHTS.competitorGap * cg.score +
      WEIGHTS.historicalLift * hl.score) *
      evidenceGate +
      localityBonus,
  );

  const monthText =
    typeof mo.monthPct === "number"
      ? ` and ${mo.monthPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(mo.monthPct))}% across 30 days`
      : "";
  const deltaText = sparse
    ? `too small for Google's meter in ${signal.geo} — an idea that fits, not a measured wave`
    : signal.delta_pct !== null
      ? `${signal.delta_pct >= 0 ? "up" : "down"} ${Math.abs(Math.round(signal.delta_pct))}% ${signal.metric_type.replace(/_/g, " ")} this week${monthText}`
      : `trending in ${signal.metric_type.replace(/_/g, " ")} right now${monthText}`;
  const localityText = LOCALITY_TEXT[locality] ? ` (${LOCALITY_TEXT[locality]})` : "";

  return {
    score: Math.round(total * 100) / 10,
    components: {
      normalizedDelta: nd,
      serviceMatch: sm.score,
      competitorGap: cg.score,
      historicalLift: hl.score,
    },
    localityBonus,
    monthPct: mo.monthPct,
    sparse,
    evidenceGate,
    matchedService: sm.service,
    rationale: `"${signal.term}" is ${deltaText}${localityText}; ${sm.reason}; ${cg.reason}; ${hl.reason}.`,
    competitorGapText: cg.reason,
  };
}
