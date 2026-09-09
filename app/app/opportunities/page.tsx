import Link from "next/link";
import { redirect } from "next/navigation";

import BuildCampaignButton from "@/components/app/build-campaign-button";
import GradePill from "@/components/app/grade-pill";
import ScoreBreakdown from "@/components/app/score-breakdown";
import SourceBadge from "@/components/app/source-badge";
import Sparkline from "@/components/app/sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { setOpportunityStatusAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import { explainOpportunity } from "@/lib/recommend/explain";
import { buildInsights } from "@/lib/recommend/insights";
import { weekOf } from "@/lib/recommend/recommend";
import { titleCase } from "@/lib/text";

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
          <span className="eyebrow" style={{ margin: 0 }}>Ranked for you · week of {weekLabel}</span>
          <h1>This week&apos;s opportunities.</h1>
          <p className="context">
            One line each — open <b>why this score</b> on any row for the full read.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge"><i />{opportunities.length} ranked</span>
          {accepted > 0 && <span className="badge badge--mint"><i />{accepted} accepted</span>}
          {dismissed > 0 && <span className="badge badge--faint"><i />{dismissed} dismissed</span>}
        </div>
      </div>

      {opportunities.length === 0 && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Nothing ranked yet this week. Visit{" "}
            <Link href="/app" style={{ color: "var(--amber-text)" }}>
              This week
            </Link>{" "}
            to generate your ranking.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="term">{signal ? titleCase(signal.term) : "Opportunity"}</span>
                  {o.status !== "new" && (
                    <span className={`badge${o.status === "launched" || o.status === "accepted" ? " badge--mint" : " badge--faint"}`}>
                      <i />
                      {o.status}
                    </span>
                  )}
                </div>
                <p className="why" style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mint-text)" }}>
                  {typeof signal?.delta_pct === "number"
                    ? `${signal.delta_pct >= 0 ? "↑" : "↓"}${Math.abs(Math.round(signal.delta_pct))}% ${signal.metric_type.replace(/_/g, " ")} vs last week`
                    : signal
                      ? signal.metric_type.replace(/_/g, " ")
                      : ""}
                  {matched ? ` · matched to ${matched.name}` : ""}
                </p>
                {tags.length > 0 && (
                  <div className="opp-tags">
                    {tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}

                <details className="disclosure" style={{ marginTop: 12 }}>
                  <summary>
                    <span className="chev">›</span>
                    <span className="mono-label" style={{ color: "var(--ink-soft)" }}>
                      why this score
                    </span>
                  </summary>
                  <div className="disclosure__body">
                    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ flex: "1 1 300px", maxWidth: 460 }}>
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
                      <div style={{ flex: "0 1 280px", display: "flex", flexDirection: "column", gap: 16 }}>
                        {explained && <ScoreBreakdown components={explained.components} />}
                        <div>
                          <span className="mono-label" style={{ color: "var(--mint-text)", display: "block", marginBottom: 6 }}>
                            demand — 30d
                          </span>
                          <Sparkline points={series} width={220} height={44} />
                        </div>
                        {signal && <SourceBadge source={signal.source} metric={signal.metric_type} />}
                      </div>
                    </div>
                  </div>
                </details>
              </div>
              <div className="side">
                <GradePill score={Number(o.score)} lead={idx === 0 && !isDismissed} />
                <div className="actions">
                  {campaign ? (
                    <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary btn-sm">
                      View campaign →
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
