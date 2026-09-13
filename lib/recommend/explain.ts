import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, Learning, Opportunity, Service, Signal, SignalSeriesPoint } from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { applyRelevance, scoreOpportunity, type ScoredOpportunity } from "@/lib/scoring";
import { storedGrade, type StoredGrade } from "@/lib/scoring/grade-opportunity";
import { assessAdRead } from "@/lib/signals/ad-relevance";

import { extrasFor, loadSignalContext, type SignalContext } from "./four-signals";
import { buildBusinessFitContext, judgeTermRelevance } from "./relevance";

import { placeWords } from "@/lib/signals/geo";

export type ExplainedOpportunity = ScoredOpportunity & {
  /** The Opportunity Grade the ranking stored: letter, 0-100 score, the four
   * signal scores with their confidence, and the owner-facing notes. Null on
   * rows ranked before the four-signal model or before migration 0024. */
  grade: StoredGrade | null;
};

/**
 * Reads the caller already holds. A page that explains a dozen rows loads
 * the shared pieces once and hands them in; anything left out is read here,
 * exactly as before. `brief` is null-able, so it is "given" when the key is
 * present at all. `series` is the raw 30-day series for this signal.
 */
export interface ExplainGiven {
  services?: Service[];
  learnings?: Learning[];
  /** The category pool of the last 14 days, as the ranking read it. */
  categorySignals?: Signal[];
  brief?: BusinessBrief | null;
  /** The four-signal context for this business (built from the pool). */
  signalCtx?: SignalContext;
  series?: SignalSeriesPoint[];
}

/**
 * Re-derive the score breakdown for a stored opportunity so screens can show
 * their work. Uses the same inputs the recommend job used (services,
 * learnings, news-coverage proxy, locality) — and when the ranking was
 * judged, folds the persisted relevance back in, so the FIT meter shows the
 * judged fit the stored score actually used, not the raw token match. With
 * no persisted judgment, the deterministic fit judge gives the same kind of
 * read keylessly.
 *
 * The legacy components still feed the meters and insight lines. The grade
 * is not re-derived: baselines move daily, and a screen must show the grade
 * the week was ranked on, so it is read back as stored.
 */
export async function explainOpportunity(
  repo: Repo,
  business: Business,
  opportunity: Opportunity,
  signal: Signal,
  given: ExplainGiven = {},
): Promise<ExplainedOpportunity> {
  const [services, learnings, categorySignals, brief, series] = await Promise.all([
    given.services ?? repo.listServices(business.id),
    given.learnings ?? repo.listLearnings(business.category),
    given.categorySignals ?? repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    given.brief !== undefined ? given.brief : repo.getBusinessBrief(business.id),
    given.series ? indexSeries(given.series) : repo.getSeries(signal.normalized_term, signal.geo, 30).then(indexSeries),
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
    ? assessAdRead(adSample, adRead.term, placeWords(business), adRead.value as number).count
    : null;
  const { localityFor, localityRegion } = await import("@/lib/signals/geo");
  // The same four-signal evidence the ranking read, so the breakdown on
  // screen is the breakdown the stored score used.
  const signalCtx = given.signalCtx ?? (await loadSignalContext(repo, business, brief, categorySignals));
  const scored = scoreOpportunity(
    signal,
    services,
    learnings,
    {
      coverageCount: typeof coverage?.value === "number" ? coverage.value : null,
      adCount,
    },
    { locality: localityFor(signal.geo, localityRegion(business)), series, ...extrasFor(signal, signalCtx) },
  );
  const grade = storedGrade(opportunity);
  const withGrade = (s: ScoredOpportunity): ExplainedOpportunity =>
    grade ? { ...s, score: Math.round(grade.score * 10) / 100, grade } : { ...s, grade: null };
  // A judged ranking persisted its relevance — show exactly what it used.
  if (opportunity.relevance != null) {
    const reason =
      opportunity.rationale.match(/Snapshot read: (.+)$/)?.[1] ?? "judged against your snapshot";
    return withGrade(applyRelevance(scored, Number(opportunity.relevance), reason));
  }
  // Unjudged (legacy rows): the deterministic judge is the honest stand-in.
  const fitCtx = buildBusinessFitContext(business, services, brief);
  const j = judgeTermRelevance(signal.term, business.category, fitCtx);
  return withGrade(applyRelevance(scored, j.relevance, j.reason, "Fit read"));
}
