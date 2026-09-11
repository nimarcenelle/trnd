import Link from "next/link";
import { redirect } from "next/navigation";

import ResultEntryForm from "@/components/app/result-entry-form";
import { getSessionUser } from "@/lib/auth/session";
import { titleCase } from "@/lib/text";
import { getUserRepo } from "@/lib/db";
import { buildResultsTakeaway } from "@/lib/recommend/insights";

export const metadata = { title: "Results — TRND" };

const fmtMoney = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const fmtPct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

import { CTR_BENCHMARKS } from "@/lib/results/benchmarks";

export default async function ResultsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const campaigns = await repo.listCampaigns(business.id);
  const liveOnes = campaigns.filter((c) => c.status === "live");
  const results = await repo.listResultsForBusiness(business.id);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const learnings = (await repo.listLearnings(business.category)).filter((l) => l.source === "measured");

  // Roll-ups for the KPI row.
  const sum = (f: (r: (typeof results)[number]) => number | null) =>
    results.reduce((acc, r) => acc + (f(r) ?? 0), 0);
  const totalSpend = sum((r) => r.spend_cents);
  const totalRevenue = sum((r) => r.revenue_cents);
  const totalBookings = sum((r) => r.bookings);
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
  const ctrs = results.map((r) => (r.ctr === null ? null : Number(r.ctr))).filter((v): v is number => v !== null);
  const avgCtr = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null;
  const benchmark = CTR_BENCHMARKS[business.category] ?? 0.015;

  // CTR by campaign for the comparison chart (latest result per campaign).
  const latestByCampaign = new Map<string, { hook: string; ctr: number }>();
  for (const r of results) {
    const c = campaignById.get(r.campaign_id);
    if (!c || r.ctr === null || latestByCampaign.has(r.campaign_id)) continue;
    latestByCampaign.set(r.campaign_id, { hook: c.hook, ctr: Number(r.ctr) });
  }
  const chartRows = [...latestByCampaign.values()].slice(0, 6);
  const takeaway = buildResultsTakeaway({ avgCtr, benchmark, roas });
  const chartMax = Math.max(benchmark, ...chartRows.map((r) => r.ctr)) * 1.15 || 0.02;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow eyebrow--mint" style={{ margin: 0 }}>Measured reality</span>
          <h1>What actually happened.</h1>
          <p className="context">
            Type in what your ad account reports. Every entry sharpens next week&apos;s
            recommendation — Meta API sync drops in later without changing this screen.
          </p>
        </div>
      </div>

      {results.length > 0 && (
        <div className="kpi-row">
          <div className="kpi">
            <span className="k">Total spend</span>
            <span className="v">{fmtMoney(totalSpend)}</span>
            <span className="s">{results.length} recorded flight{results.length === 1 ? "" : "s"}</span>
          </div>
          <div className="kpi">
            <span className="k">Revenue attributed</span>
            <span className="v">{fmtMoney(totalRevenue)}</span>
            <span className="s">{totalBookings} bookings</span>
          </div>
          <div className="kpi">
            <span className="k">Return on ad spend</span>
            <span className="v">{roas === null ? "—" : `${roas.toFixed(1)}×`}</span>
            <span className={roas !== null && roas >= 2 ? "s up" : "s"}>
              {roas === null ? "needs spend + revenue" : roas >= 2 ? "healthy" : "watch this"}
            </span>
          </div>
          <div className="kpi">
            <span className="k">Avg CTR</span>
            <span className="v">
              {avgCtr === null ? "—" : (avgCtr * 100).toFixed(2)}
              {avgCtr !== null && <small>%</small>}
            </span>
            <span className={avgCtr !== null && avgCtr >= benchmark ? "s up" : "s"}>
              vs ~{(benchmark * 100).toFixed(1)}% category typical*
            </span>
          </div>
        </div>
      )}

      {takeaway && (
        <div className="takeaway">
          <span className="k">Read</span>
          <p>{takeaway}</p>
        </div>
      )}

      {liveOnes.length === 0 && results.length === 0 && (
        <>
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="4" y="20" width="6" height="16" rx="1.5" stroke="var(--ink-faint)" strokeWidth="2" />
              <rect x="17" y="10" width="6" height="26" rx="1.5" stroke="var(--ink-faint)" strokeWidth="2" />
              <rect x="30" y="4" width="6" height="32" rx="1.5" stroke="var(--amber)" strokeWidth="2" />
            </svg>
            <h3>No campaigns launched yet</h3>
            <p>
              Build a campaign from{" "}
              <Link href="/app" style={{ color: "var(--amber-text)" }}>
                this week&apos;s recommendation
              </Link>
              , mark it launched, and its numbers — clicks, bookings, cost per result — start
              filling this screen in.
            </p>
          </div>
          <div className="ghost-table" style={{ marginBottom: 26 }}>
            <div className="g-row"><span>Campaign</span><span>CTR</span><span>Clicks</span><span>Bookings</span><span>Cost / result</span></div>
            {(campaigns.length > 0
              ? campaigns.slice(0, 3).map((c) => c.hook)
              : ["Your first campaign", "Your second campaign", "Your third campaign"]
            ).map((label) => (
              <div className="g-row" key={label}>
                <span>{label}</span><span>—</span><span>—</span><span>—</span><span>—</span>
              </div>
            ))}
            <div className="ghost-overlay">
              <span>Preview — unlocks after your first launch</span>
            </div>
          </div>
        </>
      )}

      {liveOnes.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div className="panel__head" style={{ marginBottom: 12 }}>
            <span className="panel__title">Awaiting results</span>
            <span className="panel__meta">{liveOnes.length} live</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {liveOnes.map((c) => (
              <div key={c.id} className="panel" style={{ padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  <Link href={`/app/campaigns/${c.id}`} style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16 }}>
                    {c.hook}
                  </Link>
                  <span className="badge badge--mint">
                    <i />
                    live since {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <ResultEntryForm campaignId={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {chartRows.length > 0 && (
        <section className="panel" style={{ marginBottom: 26 }}>
          <div className="panel__head">
            <span className="panel__title mint">CTR by campaign</span>
            <span className="panel__meta">dashed line = category typical*</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {chartRows.map((row) => (
              <div key={row.hook} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 240px) 1fr 56px", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, lineHeight: 1.35, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.hook}>
                  {row.hook}
                </span>
                <div style={{ position: "relative", height: 14, background: "var(--bg-2)", borderRadius: 4 }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: "0 auto 0 0",
                      width: `${Math.min(100, (row.ctr / chartMax) * 100)}%`,
                      background: "var(--mint)",
                      borderRadius: 4,
                      minWidth: 4,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: -3,
                      bottom: -3,
                      left: `${Math.min(100, (benchmark / chartMax) * 100)}%`,
                      borderLeft: "2px dashed var(--ink-faint)",
                    }}
                    title={`category typical ~${(benchmark * 100).toFixed(1)}%`}
                  />
                </div>
                <span className="mono-label" style={{ textAlign: "right", color: "var(--mint-text)", fontWeight: 600, fontSize: 11.5 }}>
                  {(row.ctr * 100).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: "14px 0 0" }}>
            *Category average is a planning estimate, not a guarantee.
          </p>
        </section>
      )}

      {results.length > 0 && (
        <section className="panel" style={{ overflowX: "auto", marginBottom: 26 }}>
          <div className="panel__head">
            <span className="panel__title mint">History</span>
            <span className="panel__meta">{results.length} {results.length === 1 ? "entry" : "entries"}</span>
          </div>
          <table className="data-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Date</th>
                <th className="num">Impressions</th>
                <th className="num">Clicks</th>
                <th className="num">CTR</th>
                <th className="num">Spend</th>
                <th className="num">Cost / result</th>
                <th className="num">Bookings</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const c = campaignById.get(r.campaign_id);
                const ctr = r.ctr === null ? null : Number(r.ctr);
                return (
                  <tr key={r.id}>
                    <td style={{ maxWidth: 240 }}>
                      {c ? (
                        <Link href={`/app/campaigns/${c.id}`} style={{ color: "var(--ink)" }}>
                          {c.hook}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="num">{fmtNum(r.impressions)}</td>
                    <td className="num">{fmtNum(r.clicks)}</td>
                    <td className="num" style={{ color: "var(--mint-text)", fontWeight: 600 }}>
                      {fmtPct(ctr)}
                      {ctr !== null && (
                        <span style={{ color: "var(--ink-faint)", fontWeight: 400, marginLeft: 6 }}>
                          {ctr >= benchmark ? "▲" : "▽"}
                        </span>
                      )}
                    </td>
                    <td className="num">{fmtMoney(r.spend_cents)}</td>
                    <td className="num">{fmtMoney(r.cpa_cents)}</td>
                    <td className="num">{fmtNum(r.bookings)}</td>
                    <td className="num">{fmtMoney(r.revenue_cents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {learnings.length > 0 && (
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">What TRND has learned for {titleCase(business.category)}</span>
            <span className="panel__meta">Feeds the track record in every score</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {learnings.map((l) => (
              <span key={l.id} className="pill" title={`${l.sample_size} recorded results`}>
                {l.angle_type.replace(/_/g, " ")} · lift {Number(l.lift).toFixed(2)} · {l.sample_size} result{l.sample_size === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
