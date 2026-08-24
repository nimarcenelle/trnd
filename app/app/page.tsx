import Link from "next/link";
import { redirect } from "next/navigation";

import ScoreBreakdown from "@/components/app/score-breakdown";
import ScoreDial from "@/components/app/score-dial";
import SourceBadge from "@/components/app/source-badge";
import TrendChart from "@/components/app/trend-chart";
import MiniBars from "@/components/app/mini-bars";
import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignAction } from "@/lib/campaigns/actions";
import { getUserRepo } from "@/lib/db";
import type { Signal } from "@/lib/db/types";
import { explainOpportunity } from "@/lib/recommend/explain";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";

export const metadata = { title: "This week — TRND" };

function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

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

  const weekEnd = new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86400_000);
  const weekRange = `${fmtDate(week)} – ${fmtDate(weekEnd)}`;

  const [categorySignals, campaigns, results] = await Promise.all([
    repo.listSignalsForCategory(business.category, { sinceDays: 7 }),
    repo.listCampaigns(business.id),
    repo.listResultsForBusiness(business.id),
  ]);
  const watched = categorySignals.filter((s) => s.metric_type !== "news_coverage");
  const launched = campaigns.filter((c) => c.status === "live" || c.status === "complete");
  const ctrs = results.map((r) => r.ctr).filter((v): v is number => typeof v === "number");
  const avgCtr = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null;

  if (!top) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
            <h1>No live signal for your category yet.</h1>
            <p className="context">
              Ingestion hasn&apos;t captured signal for <b>{business.category}</b> in the last
              two weeks — or everything this week was dismissed.
            </p>
          </div>
        </div>
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14.5 }}>
            Run <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>pnpm seed</code> for
            illustrative data or <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>pnpm job:ingest</code>{" "}
            for live sources, then refresh. Signal refreshes daily once the cron jobs are live.
          </p>
          <Link className="btn btn-ghost btn-sm" href="/app/opportunities" style={{ marginTop: 18 }}>
            Review dismissed opportunities
          </Link>
        </div>
      </div>
    );
  }

  const [signal, campaign] = await Promise.all([
    repo.getSignal(top.signal_id),
    repo.getCampaignByOpportunity(top.id),
  ]);
  const series = signal ? await repo.getSeries(signal.normalized_term, signal.geo, 30) : [];
  const explained = signal ? await explainOpportunity(repo, business, top, signal) : null;
  const matchedService = top.matched_service_id
    ? (await repo.listServices(business.id)).find((s) => s.id === top.matched_service_id) ?? null
    : null;

  // Runner-ups + their signals for the strip below the hero.
  const runnerUps = active.slice(1, 4);
  const runnerSignals = new Map<string, Signal | null>(
    await Promise.all(runnerUps.map(async (o) => [o.id, await repo.getSignal(o.signal_id)] as const)),
  );
  const runnerExplained = new Map(
    await Promise.all(
      runnerUps.map(async (o) => {
        const s = runnerSignals.get(o.id);
        return [o.id, s ? await explainOpportunity(repo, business, o, s) : null] as const;
      }),
    ),
  );

  // Market pulse: this week's top movers in the category.
  const movers = [...watched]
    .filter((s) => typeof s.delta_pct === "number")
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
    .slice(0, 5);

  const recentCampaigns = campaigns.slice(0, 4);
  const whyBullets = top.rationale
    .split(/;\s*/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>This week&apos;s recommendation · {weekRange}</span>
          <h1>{business.name.endsWith("s") ? `${business.name}’` : `${business.name}’s`} week, read for you.</h1>
          <p className="context">
            <b>{business.category}</b> · {business.city}
            {business.region ? `, ${business.region}` : ""} · {business.radius_miles} mile radius ·
            signal refreshes daily
          </p>
        </div>
        {signal?.source === "seed" && (
          <SourceBadge source="seed" />
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <span className="k">Signals watched · 7d</span>
          <span className="v">{watched.length}</span>
          <span className="s">across {business.category.toLowerCase()}</span>
        </div>
        <div className="kpi">
          <span className="k">Ranked this week</span>
          <span className="v">{active.length}</span>
          <span className="s">opportunities above threshold</span>
        </div>
        <div className="kpi">
          <span className="k">Campaigns launched</span>
          <span className="v">{launched.length}</span>
          <span className="s">{campaigns.length} generated total</span>
        </div>
        <div className="kpi">
          <span className="k">Avg CTR to date</span>
          <span className="v">
            {avgCtr !== null ? (avgCtr * 100).toFixed(2) : "—"}
            {avgCtr !== null && <small>%</small>}
          </span>
          <span className={avgCtr !== null && avgCtr > 0.015 ? "s up" : "s"}>
            {avgCtr !== null ? "from your recorded results" : "record results to track this"}
          </span>
        </div>
      </div>

      {/* ---------- HERO RECOMMENDATION ---------- */}
      <section className="panel panel--hero" style={{ padding: "30px 32px 28px" }}>
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px", minWidth: 280 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span className="badge badge--amber"><i />#1 this week</span>
              {signal && <SourceBadge source={signal.source} metric={signal.metric_type} />}
              {typeof signal?.delta_pct === "number" && (
                <span className="delta-chip">↑{Math.round(signal.delta_pct)}% this week</span>
              )}
            </div>
            <h2 className="h-disp" style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: "0 0 16px", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              {signal?.term ?? "This week's opportunity"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, margin: "0 0 24px" }}>
              {whyBullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.55, color: "var(--ink-soft)" }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" style={{ flex: "0 0 auto", marginTop: 3 }} aria-hidden="true">
                    <path d="M3 8.5L6.5 12L13 4" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <span>{b.charAt(0).toUpperCase() + b.slice(1)}</span>
                </div>
              ))}
            </div>

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
                All {active.length} ranked →
              </Link>
            </form>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 300, maxWidth: 420, display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
            <ScoreDial score={Number(top.score)} />
            {explained && (
              <div style={{ width: "100%" }}>
                <ScoreBreakdown components={explained.components} />
              </div>
            )}
          </div>
        </div>

        <div className="facts-grid" style={{ marginTop: 26, paddingTop: 22, borderTop: "1px dashed var(--line)" }}>
          <div>
            <span className="k">Matched service</span>
            <p className="v">{matchedService ? matchedService.name : "New offer opportunity"}</p>
          </div>
          <div>
            <span className="k">Competitor gap</span>
            <p className="v">{top.competitor_gap ?? "—"}</p>
          </div>
          <div>
            <span className="k">Suggested offer window</span>
            <p className="v">Launch by {fmtDate(new Date(new Date(`${week}T00:00:00Z`).getTime() + 3 * 86400_000).toISOString().slice(0, 10))} to ride the rise</p>
          </div>
          <div>
            <span className="k">Coverage</span>
            <p className="v">
              {business.city} · {business.radius_miles} miles
            </p>
          </div>
        </div>
      </section>

      {/* ---------- TREND CHART ---------- */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel__head">
          <span className="panel__title mint">Demand — 30 days</span>
          <span className="panel__meta">
            {signal ? `${signal.normalized_term.replace(/_/g, " ")} · ${signal.geo}` : ""}
            {signal?.source === "seed" ? " · illustrative" : ""}
          </span>
        </div>
        <TrendChart points={series} />
      </section>

      {/* ---------- RUNNER-UPS + MARKET PULSE ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }} className="two-col">
        {runnerUps.length > 0 && (
          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">Next in line</span>
              <Link href="/app/opportunities" className="panel__meta" style={{ color: "var(--amber-text)" }}>
                view all →
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {runnerUps.map((o, i) => {
                const s = runnerSignals.get(o.id);
                const ex = runnerExplained.get(o.id);
                return (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      padding: "13px 0",
                      borderBottom: i < runnerUps.length - 1 ? "1px dashed var(--line)" : "none",
                    }}
                  >
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--ink-faint)", fontSize: 14, width: 22 }}>
                      #{i + 2}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5 }}>{s?.term}</span>
                      <span className="panel__meta" style={{ display: "block", marginTop: 2 }}>
                        {typeof s?.delta_pct === "number" ? `↑${Math.round(s.delta_pct)}% · ` : ""}
                        {s?.metric_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {ex && <MiniBars components={ex.components} />}
                    <span className="score-num" style={{ fontSize: 16, color: "var(--amber-text)" }}>
                      {Number(o.score).toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title mint">Market pulse · 7d</span>
            <span className="panel__meta">{business.category.toLowerCase()}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {movers.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderBottom: i < movers.length - 1 ? "1px dashed var(--line)" : "none",
                }}
              >
                <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{s.term}</span>
                <span className="delta-chip">↑{Math.round(s.delta_pct ?? 0)}%</span>
              </div>
            ))}
            {movers.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-faint)" }}>No movement captured this week.</p>
            )}
          </div>
        </section>
      </div>

      {/* ---------- RECENT CAMPAIGNS ---------- */}
      {recentCampaigns.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <div className="panel__head" style={{ marginBottom: 12 }}>
            <span className="panel__title">Recent campaigns</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {recentCampaigns.map((c) => (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} className="card" style={{ padding: 18, display: "block" }}>
                <span className={`badge${c.status === "live" || c.status === "complete" ? " badge--mint" : ""}`}>
                  <i />
                  {c.status}
                </span>
                <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15, margin: "10px 0 4px", lineHeight: 1.3 }}>
                  {c.hook}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: 0 }}>
                  {fmtDate(c.created_at.slice(0, 10))} · {c.channel}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
