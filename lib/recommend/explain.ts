import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { applyRelevance, scoreOpportunity, type ScoredOpportunity } from "@/lib/scoring";
import { assessAdRead } from "@/lib/signals/ad-relevance";

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
  const [services, learnings, categorySignals, brief, series] = await Promise.all([
    repo.listServices(business.id),
    repo.listLearnings(business.category),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    repo.getBusinessBrief(business.id),
    repo.getSeries(signal.normalized_term, signal.geo, 30),
  ]);
  const coverage = categorySignals.find(
    (s) => s.metric_type === "news_coverage" && s.normalized_term === signal.normalized_term,
  );
  // The same Ad Library read the ranking used (queried as "<term> <city>",
  // so match the prefix too), gated by the same relevance check.
  const adRead = categorySignals.find(
    (s) =>
      s.metric_type === "ad_saturation" &&
      typeof s.value === "number" &&
      (s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`)),
  );
  const adSample = (adRead?.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads;
  const adCount = adRead
    ? assessAdRead(adSample, adRead.term, [business.city, business.region ?? ""].filter(Boolean), adRead.value as number).count
    : null;
  const { localityFor } = await import("@/lib/signals/geo");
  const scored = scoreOpportunity(
    signal,
    services,
    learnings,
    {
      coverageCount: typeof coverage?.value === "number" ? coverage.value : null,
      adCount,
    },
    { locality: localityFor(signal.geo, business.region), series },
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
