import Link from "next/link";
import { redirect } from "next/navigation";

import ScoreBadge from "@/components/app/score-badge";
import Sparkline from "@/components/app/sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";

export const metadata = { title: "This week — TRND" };

export default async function AppHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  let opportunities = await repo.listOpportunities(business.id, week);
  if (opportunities.length === 0) {
    // First visit of the week: score what we have right now so the screen is
    // never empty. The weekly cron does the same in bulk.
    await recommendForBusiness(repo, business);
    opportunities = await repo.listOpportunities(business.id, week);
  }

  const active = opportunities.filter((o) => o.status !== "dismissed");
  const top = active[0] ?? null;

  if (!top) {
    return (
      <div className="wrap" style={{ padding: "56px 32px" }}>
        <span className="eyebrow">This week</span>
        <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 10px" }}>
          No live signal for your category yet.
        </h1>
        <p style={{ color: "var(--ink-soft)", maxWidth: 520, lineHeight: 1.6 }}>
          Ingestion hasn&apos;t captured signal for {business.category} in the last two weeks —
          or everything this week was dismissed. Run <code>pnpm seed</code> for illustrative
          data or <code>pnpm job:ingest</code> for live sources, then refresh.
        </p>
        <Link className="btn btn-ghost btn-sm" href="/app/opportunities" style={{ marginTop: 18 }}>
          Review dismissed opportunities
        </Link>
      </div>
    );
  }

  const [signal, campaign] = await Promise.all([
    repo.getSignal(top.signal_id),
    repo.getCampaignByOpportunity(top.id),
  ]);
  const series = signal ? await repo.getSeries(signal.normalized_term, signal.geo, 30) : [];
  const matchedService = top.matched_service_id
    ? (await repo.listServices(business.id)).find((s) => s.id === top.matched_service_id) ?? null
    : null;
  const recentCampaigns = (await repo.listCampaigns(business.id)).slice(0, 4);
  const weekLabel = new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="wrap" style={{ padding: "44px 32px 72px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          This week&apos;s recommendation — week of {weekLabel}
        </span>
        {signal?.source === "seed" && (
          <span className="pill" title="Seeded example data — see BLOCKED.md">
            illustrative signal
          </span>
        )}
      </div>

      <section
        className="card-lg"
        style={{
          marginTop: 18,
          padding: "36px 36px 32px",
          borderColor: "var(--amber)",
          background: "linear-gradient(180deg, var(--amber-soft), transparent 55%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 28, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 380px", minWidth: 280 }}>
            <h1 className="h-disp" style={{ fontSize: "clamp(26px,3.2vw,36px)", margin: "0 0 14px", lineHeight: 1.1 }}>
              {signal?.term ?? "This week's opportunity"}
            </h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--ink-soft)", maxWidth: 560, margin: "0 0 22px" }}>
              {top.rationale}
            </p>
            <form action={buildCampaignAction} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="opportunity_id" value={top.id} />
              {campaign ? (
                <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary">
                  View the campaign →
                </Link>
              ) : (
                <button type="submit" className="btn btn-primary">
                  Build the campaign
                </button>
              )}
              <Link href="/app/opportunities" className="btn btn-ghost btn-sm">
                See all {active.length} this week
              </Link>
            </form>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-end" }}>
            <ScoreBadge score={Number(top.score)} />
            <div className="card" style={{ padding: "14px 16px" }}>
              <span className="mono-label" style={{ color: "var(--mint)", display: "block", marginBottom: 6 }}>
                demand signal — 30d
              </span>
              <Sparkline points={series} />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginTop: 26,
            paddingTop: 22,
            borderTop: "1px dashed var(--line)",
          }}
        >
          <div>
            <span className="mono-label">Matched service</span>
            <p style={{ margin: "5px 0 0", fontSize: 14 }}>
              {matchedService ? matchedService.name : "New offer opportunity"}
            </p>
          </div>
          <div>
            <span className="mono-label">Competitor gap</span>
            <p style={{ margin: "5px 0 0", fontSize: 14 }}>{top.competitor_gap ?? "—"}</p>
          </div>
          <div>
            <span className="mono-label">Signal source</span>
            <p style={{ margin: "5px 0 0", fontSize: 14 }}>
              {signal ? `${signal.source.replace(/_/g, " ")} · ${signal.metric_type.replace(/_/g, " ")}` : "—"}
            </p>
          </div>
          <div>
            <span className="mono-label">Your radius</span>
            <p style={{ margin: "5px 0 0", fontSize: 14 }}>
              {business.city} · {business.radius_miles} miles
            </p>
          </div>
        </div>
      </section>

      {recentCampaigns.length > 0 && (
        <section style={{ marginTop: 44 }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 14 }}>
            Recent campaigns
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {recentCampaigns.map((c) => (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} className="card" style={{ padding: 18, display: "block" }}>
                <span className="mono-label" style={{ color: c.status === "live" ? "var(--mint)" : undefined }}>
                  {c.status}
                </span>
                <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15, margin: "8px 0 4px", lineHeight: 1.3 }}>
                  {c.hook}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: 0 }}>
                  {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {c.channel}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
