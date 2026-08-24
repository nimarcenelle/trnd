import Link from "next/link";
import { redirect } from "next/navigation";

import MiniBars from "@/components/app/mini-bars";
import SourceBadge from "@/components/app/source-badge";
import Sparkline from "@/components/app/sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignAction, setOpportunityStatusAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import { explainOpportunity } from "@/lib/recommend/explain";
import { weekOf } from "@/lib/recommend/recommend";

export const metadata = { title: "Opportunities — TRND" };

export default async function OpportunitiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  const opportunities = await repo.listOpportunities(business.id, week);
  const services = await repo.listServices(business.id);

  const enriched = await Promise.all(
    opportunities.map(async (o) => {
      const signal = await repo.getSignal(o.signal_id);
      const [campaign, series, explained] = await Promise.all([
        repo.getCampaignByOpportunity(o.id),
        signal ? repo.getSeries(signal.normalized_term, signal.geo, 30) : Promise.resolve([]),
        signal ? explainOpportunity(repo, business, o, signal) : Promise.resolve(null),
      ]);
      return { o, signal, campaign, series, explained };
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
            Every score shows its work — momentum, fit, competitor gap, track record. Accept what&apos;s
            worth running; dismissals feed next week&apos;s ranking.
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
        {enriched.map(({ o, signal, campaign, series, explained }, idx) => {
          const isDismissed = o.status === "dismissed";
          const matched = o.matched_service_id
            ? services.find((s) => s.id === o.matched_service_id) ?? null
            : null;
          return (
            <div key={o.id} className={`opp-row${isDismissed ? " opp-row--dismissed" : ""}`}>
              <span className="rank">#{idx + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="term">{signal?.term ?? "Opportunity"}</span>
                  {typeof signal?.delta_pct === "number" && (
                    <span className="delta-chip">↑{Math.round(signal.delta_pct)}%</span>
                  )}
                </div>
                <div className="facts">
                  {signal && <SourceBadge source={signal.source} metric={signal.metric_type} />}
                  <span className="badge">
                    <i />
                    {matched ? `fits: ${matched.name}` : "new offer"}
                  </span>
                  {o.status !== "new" && (
                    <span className={`badge${o.status === "launched" || o.status === "accepted" ? " badge--mint" : " badge--faint"}`}>
                      <i />
                      {o.status}
                    </span>
                  )}
                </div>
                <p className="why">{o.rationale}</p>
              </div>
              <div className="side">
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {explained && <MiniBars components={explained.components} />}
                  <div style={{ textAlign: "right" }}>
                    <span className="score-num" style={{ fontSize: 24, color: "var(--amber-text)" }}>
                      {Number(o.score).toFixed(1)}
                    </span>
                    <span className="mono-label" style={{ display: "block", fontSize: 9 }}>
                      / 10
                    </span>
                  </div>
                </div>
                <Sparkline points={series} width={150} height={36} />
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
                      <form action={buildCampaignAction}>
                        <input type="hidden" name="opportunity_id" value={o.id} />
                        <button type="submit" className="btn btn-primary btn-sm">
                          Build campaign
                        </button>
                      </form>
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
