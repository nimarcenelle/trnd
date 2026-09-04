import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { applyRelevance, scoreOpportunity, type ScoredOpportunity } from "@/lib/scoring";

import { buildBusinessFitContext, judgeTermRelevance } from "./relevance";

/**
 * Re-derive the score breakdown for a stored opportunity so screens can show
 * their work. Uses the same inputs the recommend job used (services,
 * learnings, news-coverage proxy, locality) — and when the ranking was
 * judged, folds the persisted relevance back in, so the FIT meter shows the
 * judged fit the stored score actually used, not the raw token match. With
 * no persisted judgment, the deterministic fit judge gives the same kind of
 * read keylessly.
 */
export async function explainOpportunity(
  repo: Repo,
  business: Business,
  opportunity: Opportunity,
  signal: Signal,
): Promise<ScoredOpportunity> {
  const [services, learnings, categorySignals, brief] = await Promise.all([
    repo.listServices(business.id),
    repo.listLearnings(business.category),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    repo.getBusinessBrief(business.id),
  ]);
  const coverage = categorySignals.find(
    (s) => s.metric_type === "news_coverage" && s.normalized_term === signal.normalized_term,
  );
  const { localityFor } = await import("@/lib/signals/geo");
  const scored = scoreOpportunity(
    signal,
    services,
    learnings,
    { coverageCount: typeof coverage?.value === "number" ? coverage.value : null },
    { locality: localityFor(signal.geo, business.region) },
  );
  // A judged ranking persisted its relevance — show exactly what it used.
  if (opportunity.relevance != null) {
    const reason =
      opportunity.rationale.match(/Snapshot read: (.+)$/)?.[1] ?? "judged against your snapshot";
    return applyRelevance(scored, Number(opportunity.relevance), reason);
  }
  // Unjudged (legacy rows): the deterministic judge is the honest stand-in.
  const fitCtx = buildBusinessFitContext(business, services, brief);
  const j = judgeTermRelevance(signal.term, business.category, fitCtx);
  return applyRelevance(scored, j.relevance, j.reason, "Fit read");
}
