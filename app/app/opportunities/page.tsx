import Link from "next/link";
import { redirect } from "next/navigation";

import ScoreBadge from "@/components/app/score-badge";
import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignAction, setOpportunityStatusAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
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
  const signals = new Map(
    await Promise.all(
      opportunities.map(async (o) => [o.id, await repo.getSignal(o.signal_id)] as const),
    ),
  );
  const campaigns = new Map(
    await Promise.all(
      opportunities.map(async (o) => [o.id, await repo.getCampaignByOpportunity(o.id)] as const),
    ),
  );

  const weekLabel = new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="wrap" style={{ padding: "44px 32px 72px" }}>
      <span className="eyebrow">Ranked for you — week of {weekLabel}</span>
      <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 6px" }}>
        This week&apos;s opportunities.
      </h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: 560, lineHeight: 1.6, margin: "0 0 30px" }}>
        Every score comes with its reasoning — accept the ones worth running, dismiss the rest.
        Dismissals feed back into next week&apos;s ranking.
      </p>

      {opportunities.length === 0 && (
        <div className="card-lg" style={{ padding: 32 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            Nothing ranked yet this week. Visit{" "}
            <Link href="/app" style={{ color: "var(--amber)" }}>
              This week
            </Link>{" "}
            to generate your ranking.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {opportunities.map((o) => {
          const signal = signals.get(o.id);
          const campaign = campaigns.get(o.id);
          const dismissed = o.status === "dismissed";
          return (
            <div
              key={o.id}
              className="card-lg"
              style={{
                padding: "22px 26px",
                display: "flex",
                gap: 20,
                alignItems: "center",
                flexWrap: "wrap",
                opacity: dismissed ? 0.55 : 1,
              }}
            >
              <ScoreBadge score={Number(o.score)} size="sm" />
              <div style={{ flex: "1 1 320px", minWidth: 240 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17 }}>
                    {signal?.term ?? "Opportunity"}
                  </span>
                  <span className="mono-label">{o.status}</span>
                  {signal?.source === "seed" && <span className="mono-label">· illustrative</span>}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "6px 0 0", lineHeight: 1.55 }}>
                  {o.rationale}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {campaign ? (
                  <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary btn-sm">
                    View campaign →
                  </Link>
                ) : dismissed ? (
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
          );
        })}
      </div>
    </div>
  );
}
