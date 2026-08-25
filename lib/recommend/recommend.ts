import type { Repo } from "@/lib/db/repo";
import type { Business, NewOpportunity } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { applyRelevance, scoreOpportunity } from "@/lib/scoring";

/** Monday (UTC) of the week containing `d` — the opportunity week key. */
export function weekOf(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

const TOP_N = 5;
/** Wider pool for the relevance pass — a relevant #9 can outrank a junk #1. */
const CANDIDATE_POOL = 12;

export interface RecommendBusinessResult {
  businessId: string;
  created: number;
  topScore: number | null;
}

/**
 * Score this week's signals for one business and upsert the top N as
 * opportunities. Idempotent per (business, signal, week).
 */
export async function recommendForBusiness(
  repo: Repo,
  business: Business,
): Promise<RecommendBusinessResult> {
  const [signals, services, learnings] = await Promise.all([
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    repo.listServices(business.id),
    repo.listLearnings(business.category),
  ]);

  // News coverage per normalized term doubles as the saturation proxy.
  const coverage = new Map<string, number>();
  for (const s of signals) {
    if (s.metric_type === "news_coverage" && typeof s.value === "number") {
      coverage.set(s.normalized_term, s.value);
    }
  }

  const scorable = signals.filter((s) => s.metric_type !== "news_coverage");
  let scored = scorable
    .map((signal) => ({
      signal,
      result: scoreOpportunity(signal, services, learnings, {
        coverageCount: coverage.get(signal.normalized_term) ?? null,
      }),
    }))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, CANDIDATE_POOL);

  // Snapshot-aware relevance pass: category matching says "teeth whitening"
  // fits a contrast-therapy studio; the founding analysis knows better. One
  // Flash call re-judges the candidate pool against what the business
  // actually sells and who its customers are. Non-fatal — the deterministic
  // ranking stands when Gemini is unavailable or the call fails.
  if (isGeminiConfigured && scored.length > 0) {
    try {
      const brief = await repo.getBusinessBrief(business.id);
      if (brief) {
        const { judgeSignalRelevance } = await import("@/lib/ai/gemini");
        const judgments = await judgeSignalRelevance(
          business,
          brief,
          services,
          scored.map(({ signal }) => ({ term: signal.term, metric: signal.metric_type })),
        );
        scored = scored
          .map((entry, i) => {
            const j = judgments.get(i);
            return j
              ? { ...entry, result: applyRelevance(entry.result, j.relevance, j.reason) }
              : entry;
          })
          .sort((a, b) => b.result.score - a.result.score);
      }
    } catch (err) {
      console.warn("[recommend] relevance pass failed (non-fatal):", (err as Error).message);
    }
  }
  scored = scored.slice(0, TOP_N);

  if (scored.length === 0) {
    return { businessId: business.id, created: 0, topScore: null };
  }

  const week = weekOf();
  const inputs: NewOpportunity[] = scored.map(({ signal, result }) => ({
    business_id: business.id,
    signal_id: signal.id,
    week_of: week,
    score: result.score,
    rationale: result.rationale,
    matched_service_id: result.matchedService?.id ?? null,
    competitor_gap: result.competitorGapText,
  }));
  await repo.upsertOpportunities(inputs);

  return { businessId: business.id, created: inputs.length, topScore: scored[0].result.score };
}

export async function runRecommend(repo: Repo): Promise<RecommendBusinessResult[]> {
  const businesses = await repo.listAllBusinesses();
  const results: RecommendBusinessResult[] = [];
  for (const b of businesses) {
    try {
      results.push(await recommendForBusiness(repo, b));
    } catch (err) {
      console.warn(`[recommend] business ${b.id} failed:`, (err as Error).message);
      results.push({ businessId: b.id, created: 0, topScore: null });
    }
  }
  return results;
}
