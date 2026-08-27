import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { applyRelevance, scoreOpportunity, type ScoredOpportunity } from "@/lib/scoring";

import { buildBusinessFitContext, judgeTermRelevance } from "./relevance";

/**
 * Re-derive the score breakdown for a stored opportunity so screens can show
 * their work. Uses the same inputs the recommend job used (services,
 * learnings, news-coverage proxy — and, keyless, the same deterministic fit
 * judge), so the components match the stored score. With a Gemini key the
 * stored score carries the model judge's fit, which can't be re-derived
 * offline; the deterministic read below is the closest honest approximation.
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
  if (isGeminiConfigured) return scored;
  const fitCtx = buildBusinessFitContext(business, services, brief);
  const j = judgeTermRelevance(signal.term, business.category, fitCtx);
  return applyRelevance(scored, j.relevance, j.reason, "Fit read");
}
