import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { applyRelevance, scoreOpportunity, type ScoredOpportunity } from "@/lib/scoring";

/**
 * Re-derive the score breakdown for a stored opportunity so screens can show
 * their work. Uses the same inputs the recommend job used (services,
 * learnings, news-coverage proxy) — and when the ranking was judged, folds
 * the persisted relevance back in, so the FIT meter shows the judged fit the
 * stored score actually used, not the raw token match.
 */
export async function explainOpportunity(
  repo: Repo,
  business: Business,
  opportunity: Opportunity,
  signal: Signal,
): Promise<ScoredOpportunity> {
  const [services, learnings, categorySignals] = await Promise.all([
    repo.listServices(business.id),
    repo.listLearnings(business.category),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
  ]);
  const coverage = categorySignals.find(
    (s) => s.metric_type === "news_coverage" && s.normalized_term === signal.normalized_term,
  );
  const raw = scoreOpportunity(signal, services, learnings, {
    coverageCount: typeof coverage?.value === "number" ? coverage.value : null,
  });
  if (opportunity.relevance == null) return raw;
  const reason =
    opportunity.rationale.match(/Snapshot read: (.+)$/)?.[1] ?? "judged against your snapshot";
  return applyRelevance(raw, Number(opportunity.relevance), reason);
}
