import "./opportunities.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import BuildCampaignButton from "@/components/app/build-campaign-button";
import SourceBadge from "@/components/app/source-badge";
import Sparkline from "@/components/app/sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { setOpportunityStatusAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import { gradeChip } from "@/lib/picks/list";
import { explainOpportunity } from "@/lib/recommend/explain";
import { loadSignalContext } from "@/lib/recommend/four-signals";
import { buildInsights } from "@/lib/recommend/insights";
import { weekOf } from "@/lib/recommend/recommend";
import { deltaWindowLabel, metricLabel, scaleNote } from "@/lib/signals/source-url";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Opportunities — TRND" };

/**
 * The week's ranking, one row per term: the rank is the judgement, the
 * grade and the movement sit on the right in mono, and the why opens
 * under the row for anyone who wants it.
 */
export default async function OpportunitiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  // Everything the explanations share is read once here, not once per row.
  const [opportunities, learnings, services, categorySignals, brief] = await Promise.all([
    repo.listOpportunities(business.id, week),
    repo.listLearnings(business.category),
    repo.listServices(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
    repo.getBusinessBrief(business.id),
  ]);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const [signalCtx, signalRows] = await Promise.all([
    loadSignalContext(repo, business, brief, categorySignals),
    repo.getSignalsByIds(opportunities.map((o) => o.signal_id)),
  ]);
  const signalById = new Map(signalRows.map((s) => [s.id, s]));

  const enriched = await Promise.all(
    opportunities.map(async (o) => {
      const signal = signalById.get(o.signal_id) ?? null;
      const [campaign, series] = await Promise.all([
        repo.getCampaignByOpportunity(o.id),
        signal ? repo.getSeries(signal.normalized_term, signal.geo, 30) : Promise.resolve([]),
      ]);
      const explained = signal
        ? await explainOpportunity(repo, business, o, signal, {
            services,
            learnings,
            categorySignals,
            brief,
            signalCtx,
            series,
          })
        : null;
      const insights =
        signal && explained
          ? buildInsights(signal, explained, {
              learnings,
              // A judged-unfit row must not pitch itself as a new offer.
              unfit: Number(o.score) < 5 && !o.matched_service_id,
              snapshotReason: o.rationale?.match(/Snapshot read: (.+)$/)?.[1] ?? null,
            })
          : [];
      return { o, signal, campaign, series, insights };
    }),
  );

  const weekLabel = new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const accepted = opportunities.filter((x) => x.status === "accepted" || x.status === "launched").length;
  const dismissed = opportunities.filter((x) => x.status === "dismissed").length;
  const counts = [
    `${opportunities.length} ranked`,
    accepted > 0 ? `${accepted} accepted` : null,
    dismissed > 0 ? `${dismissed} dismissed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Week of {weekLabel}</span>
          <h1>Ranked opportunities</h1>
          <p className="context">
            {counts}. Open <b>Why</b> on a row to see how it scored.
          </p>
        </div>
      </div>

      {opportunities.length === 0 && (
        <div className="panel opps__empty">
          <p>Nothing ranked yet this week.</p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            This week&apos;s picks
          </Link>
        </div>
      )}

      <ol className="opps-list">
        {enriched.map(({ o, signal, campaign, series, insights }, idx) => {
          const isDismissed = o.status === "dismissed";
          const matched = o.matched_service_id ? serviceById.get(o.matched_service_id) : null;
          const grade = gradeChip(o);
          const delta = typeof signal?.delta_pct === "number" && Number.isFinite(signal.delta_pct) ? Math.round(signal.delta_pct) : null;
          const direction = delta === null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
          const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
          const line = [signal ? sentenceCase(metricLabel(signal.metric_type)) : null, matched ? `matched to ${matched.name}` : null]
            .filter(Boolean)
            .join(" · ");
          const status =
            o.status === "new"
              ? null
              : { label: sentenceCase(o.status), tone: o.status === "dismissed" ? "faint" : "mint" };
          return (
            <li key={o.id} className={`opps-row${isDismissed ? " is-dismissed" : ""}`}>
              <span className="opps-row__rank" aria-hidden="true">
                {idx + 1}
              </span>
              <div className="opps-row__head">
                <div className="opps-row__title">
                  <span className="opps-row__term">{signal ? sentenceCase(signal.term) : "Opportunity"}</span>
                  {status && (
                    <span className={`badge badge--${status.tone}`}>
                      <i />
                      {status.label}
                    </span>
                  )}
                </div>
                {line && <span className="opps-row__line">{line}</span>}
              </div>
              <div className="opps-row__meta">
                {/* Always rendered, so the shared columns stay put on rows without a grade. */}
                <span className="opps-row__grade-cell">
                  {grade && (
                    <span className={`picks-grade is-${grade.tone}`} title={grade.meaning}>
                      <span aria-hidden="true">{grade.letter}</span>
                      <span className="sr-only">{grade.description}</span>
                    </span>
                  )}
                </span>
                <span className={`opps-row__delta is-${direction}`}>
                  {delta !== null && signal && (
                    <>
                      <span className="opps-row__arrow" aria-hidden="true">
                        {arrow}
                      </span>
                      {Math.abs(delta)}% {deltaWindowLabel(signal.source)}
                    </>
                  )}
                </span>
                <div className="opps-row__actions">
                  {campaign ? (
                    <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary btn-sm">
                      View campaign
                    </Link>
                  ) : isDismissed ? (
                    <form action={setOpportunityStatusAction}>
                      <input type="hidden" name="opportunity_id" value={o.id} />
                      <input type="hidden" name="status" value="accepted" />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Restore
                      </button>
                    </form>
                  ) : (
                    <>
                      <BuildCampaignButton opportunityId={o.id} className="btn btn-primary btn-sm">
                        Build campaign
                      </BuildCampaignButton>
                      <form action={setOpportunityStatusAction}>
                        <input type="hidden" name="opportunity_id" value={o.id} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Dismiss
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
              {(insights.length > 0 || signal) && (
                <details className="opps-row__why">
                  <summary>Why</summary>
                  <div className="opps-row__why-body">
                    {insights.length > 0 && (
                      <ul className="opps-row__insights">
                        {insights.map((ins) => (
                          <li key={ins.kind}>
                            <b>{sentenceCase(ins.headline)}</b>
                            <span>{ins.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {signal && (
                      <div className="opps-row__demand">
                        <Sparkline
                          points={series}
                          width={440}
                          height={72}
                          fluid
                          axes
                          note={scaleNote(signal.source, signal.metric_type)}
                        />
                        <SourceBadge source={signal.source} metric={signal.metric_type} term={signal.term} geo={signal.geo} raw={signal.raw} />
                      </div>
                    )}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
