import Link from "next/link";
import { redirect } from "next/navigation";

import BuildCampaignButton from "@/components/app/build-campaign-button";
import DeltaChip from "@/components/app/delta-chip";
import SourceBadge from "@/components/app/source-badge";
import Sparkline from "@/components/app/sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { setOpportunityStatusAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import { explainOpportunity } from "@/lib/recommend/explain";
import { buildInsights } from "@/lib/recommend/insights";
import { weekOf } from "@/lib/recommend/recommend";
import { deltaWindowLabel, metricLabel, scaleNote } from "@/lib/signals/source-url";
import { sentenceCase, titleCase } from "@/lib/text";

export const metadata = { title: "Opportunities — TRND" };

export default async function OpportunitiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  const [opportunities, learnings, services] = await Promise.all([
    repo.listOpportunities(business.id, week),
    repo.listLearnings(business.category),
    repo.listServices(business.id),
  ]);
  const serviceById = new Map(services.map((s) => [s.id, s]));

  const enriched = await Promise.all(
    opportunities.map(async (o) => {
      const signal = await repo.getSignal(o.signal_id);
      const [campaign, series, explained] = await Promise.all([
        repo.getCampaignByOpportunity(o.id),
        signal ? repo.getSeries(signal.normalized_term, signal.geo, 30) : Promise.resolve([]),
        signal ? explainOpportunity(repo, business, o, signal) : Promise.resolve(null),
      ]);
      const insights =
        signal && explained
          ? buildInsights(signal, explained, {
              learnings,
              // A judged-unfit row must not pitch itself as a new offer.
              unfit: Number(o.score) < 4.3 && !o.matched_service_id,
              snapshotReason: o.rationale?.match(/Snapshot read: (.+)$/)?.[1] ?? null,
            })
          : [];
      return { o, signal, campaign, series, explained, insights };
    }),
  );

  const weekLabel = new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const accepted = opportunities.filter((x) => x.status === "accepted" || x.status === "launched").length;
  const dismissed = opportunities.filter((x) => x.status === "dismissed").length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Week of {weekLabel}</span>
          <h1>Ranked opportunities</h1>
          <p className="context">
            Open any row to see why it scored the way it did.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="badge"><i />{opportunities.length} ranked</span>
          {accepted > 0 && <span className="badge badge--mint"><i />{accepted} accepted</span>}
          {dismissed > 0 && <span className="badge badge--faint"><i />{dismissed} dismissed</span>}
        </div>
      </div>

      {opportunities.length === 0 && (
        <div className="panel max-w-[620px]">
          <p className="m-0 text-ink-soft text-[14.5px] leading-[1.6]">
            Nothing ranked yet this week. Visit{" "}
            <Link className="text-(--amber-text)" href="/app/picks">
              This week
            </Link>{" "}
            to generate your ranking.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-[14px]">
        {enriched.map(({ o, signal, campaign, series, explained, insights }, idx) => {
          const isDismissed = o.status === "dismissed";
          const matched = o.matched_service_id ? serviceById.get(o.matched_service_id) : null;
          const tags = insights
            .filter((i) => i.kind !== "momentum")
            .map((i) => i.headline)
            .slice(0, 3);
          return (
            <div key={o.id} className={`opp-row${isDismissed ? " opp-row--dismissed" : ""}${idx === 0 && !isDismissed ? " opp-row--lead" : ""}`}>
              <span className="rank">#{idx + 1}</span>
              <div className="min-w-0">
                <div className="flex gap-3 items-baseline flex-wrap">
                  <span className="term">{signal ? titleCase(signal.term) : "Opportunity"}</span>
                  {o.status !== "new" && (
                    <span className={`badge${o.status === "launched" || o.status === "accepted" ? " badge--mint" : " badge--faint"}`}>
                      <i />
                      {sentenceCase(o.status)}
                    </span>
                  )}
                </div>
                <p className="why mt-[6px] font-mono text-[11.5px] text-(--mint-text) flex gap-2 items-center flex-wrap">
                  {typeof signal?.delta_pct === "number" && (
                    <DeltaChip delta={signal.delta_pct} />
                  )}
                  <span>
                    {signal ? metricLabel(signal.metric_type) : ""}
                    {typeof signal?.delta_pct === "number" ? ` ${deltaWindowLabel(signal.source)}` : ""}
                    {matched ? ` · matched to ${matched.name}` : ""}
                  </span>
                </p>
                {tags.length > 0 && (
                  <div className="opp-tags">
                    {tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}

                <details className="disclosure mt-3">
                  <summary>
                    <span className="chev">›</span>
                    <span className="mono-label text-ink-soft">
                      why it ranked
                    </span>
                  </summary>
                  <div className="disclosure__body">
                    <div className="flex gap-7 flex-wrap items-start">
                      <div className="flex-[1_1_300px] max-w-[460px]">
                        {insights.map((ins) => (
                          <div className="insight" key={ins.kind}>
                            <span className={`insight__dot insight__dot--${ins.kind}`} />
                            <div>
                              <span className="insight__headline">{ins.headline}</span>
                              <p className="insight__detail">{ins.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="score-card">
                        <div className="score-card__demand">
                          <span className="mono-label text-(--mint-text) block mb-2">
                            Demand — 30d
                          </span>
                          <Sparkline
                            points={series}
                            width={440}
                            height={72}
                            fluid
                            axes
                            note={signal ? scaleNote(signal.source, signal.metric_type) : null}
                          />
                        </div>
                        {signal && (
                          <SourceBadge source={signal.source} metric={signal.metric_type} term={signal.term} geo={signal.geo} raw={signal.raw} />
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </div>
              <div className="side">
                <div className="actions">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
