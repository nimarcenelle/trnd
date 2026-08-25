/**
 * Opportunity scoring — the whole formula in one file, per the brief:
 *
 *   score = 0.35 * normalized_delta   // how fast it's rising
 *         + 0.25 * service_match      // does this business already sell it
 *         + 0.20 * competitor_gap     // inverse of local ad saturation (proxy)
 *         + 0.20 * historical_lift    // from `learnings`, 0.5 neutral when empty
 *
 * Every component is 0..1; the total is rendered as 0–10 with one decimal.
 * A number with no explanation is exactly the "dashboard of mentions" TRND
 * refuses to be — buildRationale() turns the components into plain English.
 */

import type { Learning, Service, Signal } from "@/lib/db/types";

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

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "near", "me",
  "at", "vs", "with", "your", "my", "before", "after", "best",
]);

function tokens(text: string): Set<string> {
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
  /** Recent news/ad coverage count for the same term, when we have it. */
  coverageCount: number | null;
}

/** Inverse of saturation. Little coverage of a rising term = open door. */
export function competitorGap({ coverageCount }: GapInput): { score: number; reason: string } {
  if (coverageCount === null) {
    return { score: 0.6, reason: "competitor ad saturation looks low (proxy estimate)" };
  }
  const score = 1 - Math.min(1, coverageCount / 15);
  const label = score > 0.66 ? "low" : score > 0.33 ? "moderate" : "high";
  return { score, reason: `local coverage of this is ${label} (${coverageCount} recent mentions)` };
}

/** Average lift from learnings for this category; neutral 0.5 when empty. */
export function historicalLift(learnings: Learning[]): { score: number; reason: string } {
  if (learnings.length === 0) {
    return { score: 0.5, reason: "no comparable campaign history yet — neutral prior" };
  }
  const totalWeight = learnings.reduce((s, l) => s + l.sample_size, 0) || learnings.length;
  const avg =
    learnings.reduce((s, l) => s + l.lift * (l.sample_size || 1), 0) / totalWeight;
  const score = Math.min(1, Math.max(0, avg));
  return {
    score,
    reason: `similar angles ran ${score >= 0.6 ? "well" : "unevenly"} for businesses like yours (${learnings.length} learnings)`,
  };
}

export interface ScoredOpportunity {
  score: number; // 0..10, one decimal
  components: {
    normalizedDelta: number;
    serviceMatch: number;
    competitorGap: number;
    historicalLift: number;
  };
  matchedService: Service | null;
  rationale: string;
  competitorGapText: string;
}

/**
 * Fold in the snapshot-aware relevance judgment: the fit component becomes
 * the judged relevance (the token-overlap guess was only ever a proxy for
 * "does this make sense for THIS business"), the total re-derives from the
 * same public weights, and the reason lands in the rationale.
 */
export function applyRelevance(
  result: ScoredOpportunity,
  relevance: number,
  reason: string,
): ScoredOpportunity {
  const fit = Math.min(1, Math.max(0, relevance));
  const c = result.components;
  const total =
    WEIGHTS.normalizedDelta * c.normalizedDelta +
    WEIGHTS.serviceMatch * fit +
    WEIGHTS.competitorGap * c.competitorGap +
    WEIGHTS.historicalLift * c.historicalLift;
  return {
    ...result,
    score: Math.round(total * 100) / 10,
    components: { ...c, serviceMatch: fit },
    // A "matched service" claim under an irrelevant term reads as nonsense.
    matchedService: fit < 0.3 ? null : result.matchedService,
    rationale: `${result.rationale} Snapshot read: ${reason}`,
  };
}

export function scoreOpportunity(
  signal: Signal,
  services: Service[],
  learnings: Learning[],
  gap: GapInput,
): ScoredOpportunity {
  const nd = normalizedDelta(signal.delta_pct);
  const sm = matchService(signal, services);
  const cg = competitorGap(gap);
  const hl = historicalLift(learnings);

  const total =
    WEIGHTS.normalizedDelta * nd +
    WEIGHTS.serviceMatch * sm.score +
    WEIGHTS.competitorGap * cg.score +
    WEIGHTS.historicalLift * hl.score;

  const deltaText =
    signal.delta_pct !== null
      ? `up ${Math.round(signal.delta_pct)}% ${signal.metric_type.replace(/_/g, " ")} this week`
      : `trending in ${signal.metric_type.replace(/_/g, " ")} right now`;

  return {
    score: Math.round(total * 100) / 10,
    components: {
      normalizedDelta: nd,
      serviceMatch: sm.score,
      competitorGap: cg.score,
      historicalLift: hl.score,
    },
    matchedService: sm.service,
    rationale: `"${signal.term}" is ${deltaText}; ${sm.reason}; ${cg.reason}; ${hl.reason}.`,
    competitorGapText: cg.reason,
  };
}
