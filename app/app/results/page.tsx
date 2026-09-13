import Link from "next/link";
import { redirect } from "next/navigation";

import ResultEntryForm from "@/components/app/result-entry-form";
import { getSessionUser } from "@/lib/auth/session";
import { sentenceCase } from "@/lib/text";
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
          <h1>Results</h1>
          <p className="context">
            Enter what your ad account reports. Each entry sharpens next week&apos;s recommendation.
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
              <Link className="text-(--amber-text)" href="/app/picks">
                this week&apos;s recommendation
              </Link>
              , mark it launched, and its numbers — clicks, bookings, cost per result — start
              filling this screen in.
            </p>
          </div>
          <div className="ghost-table mb-[26px]">
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
        <section className="mb-[26px]">
          <div className="panel__head mb-3">
            <span className="panel__title">Awaiting results</span>
            <span className="panel__meta">{liveOnes.length} live</span>
          </div>
          <div className="flex flex-col gap-[14px]">
            {liveOnes.map((c) => (
              <div key={c.id} className="panel py-5 px-6">
                <div className="flex justify-between flex-wrap gap-2 mb-[14px]">
                  <Link className="font-disp font-bold text-[16px]" href={`/app/campaigns/${c.id}`}>
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
        <section className="panel mb-[26px]">
          <div className="panel__head">
            <span className="panel__title mint">CTR by campaign</span>
            <span className="panel__meta">Dashed line: category average</span>
          </div>
          <div className="flex flex-col gap-3">
            {chartRows.map((row) => (
              <div className="grid grid-cols-[minmax(140px,_240px)_1fr_56px] gap-3 items-center" key={row.hook}>
                <span className="text-[12.5px] leading-[1.35] text-ink-soft overflow-hidden text-ellipsis whitespace-nowrap" title={row.hook}>
                  {row.hook}
                </span>
                <div className="relative h-[14px] bg-bg-2 rounded-[4px]">
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
                <span className="mono-label text-right text-(--mint-text) font-semibold text-[11.5px]">
                  {(row.ctr * 100).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mx-0 mt-[14px] mb-0">
            *Category average is a planning estimate, not a guarantee.
          </p>
        </section>
      )}

      {results.length > 0 && (
        <section className="panel overflow-x-auto mb-[26px]">
          <div className="panel__head">
            <span className="panel__title mint">History</span>
            <span className="panel__meta">{results.length} {results.length === 1 ? "entry" : "entries"}</span>
          </div>
          <table className="data-table min-w-[760px]">
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
                    <td className="max-w-[240px]">
                      {c ? (
                        <Link className="text-ink" href={`/app/campaigns/${c.id}`}>
                          {c.hook}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="num">{fmtNum(r.impressions)}</td>
                    <td className="num">{fmtNum(r.clicks)}</td>
                    <td className="num text-(--mint-text) font-semibold">
                      {fmtPct(ctr)}
                      {ctr !== null && (
                        <span className="text-ink-faint font-normal ml-[6px]">
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
            <span className="panel__title">What converts in {sentenceCase(business.category)}</span>
            <span className="panel__meta">Feeds the track record in every score</span>
          </div>
          <div className="flex flex-wrap gap-[10px]">
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
