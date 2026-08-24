import type { Repo } from "@/lib/db/repo";
import type { Business, NewOpportunity, Signal } from "@/lib/db/types";
import { scoreOpportunity } from "@/lib/scoring";

/** Monday (UTC) of the week containing `d` — the opportunity week key. */
export function weekOf(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

const TOP_N = 5;

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
  const scored = scorable
    .map((signal) => ({
      signal,
      result: scoreOpportunity(signal, services, learnings, {
        coverageCount: coverage.get(signal.normalized_term) ?? null,
      }),
    }))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, TOP_N);

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
