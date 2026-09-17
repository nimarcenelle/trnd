import "./results.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import ResultEntryForm from "@/components/app/result-entry-form";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { shortDate } from "@/lib/picks/list";
import { buildResultsTakeaway } from "@/lib/recommend/insights";
import { CTR_BENCHMARKS } from "@/lib/results/benchmarks";
import { rollupCountLabel, rollupResults } from "@/lib/results/rollup";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Results — TRND" };

const fmtMoney = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const fmtPct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

/**
 * What the campaigns did. Four numbers across the top, the live ones
 * waiting on an entry, then every recorded result as a table.
 */
export default async function ResultsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const [campaigns, results, allLearnings, pickRuns] = await Promise.all([
    repo.listCampaigns(business.id),
    repo.listResultsForBusiness(business.id),
    repo.listLearnings(business.category),
    // The creative tests that ended with numbers, entered or synced.
    repo.listPickRuns(business.id).catch(() => []),
  ]);
  const liveOnes = campaigns.filter((c) => c.status === "live");
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const learnings = allLearnings.filter((l) => l.source === "measured");

  // Roll-ups for the stat row: campaign results and completed tests together.
  const rollup = rollupResults(
    results,
    pickRuns.map(({ run }) => run),
  );
  const { roas, avgCtr } = rollup;
  const benchmark = CTR_BENCHMARKS[business.category] ?? 0.015;
  const takeaway = buildResultsTakeaway({ avgCtr, benchmark, roas });
  const anything = results.length > 0 || rollup.tests > 0;

  const stats = [
    { label: `Spend · ${rollupCountLabel(rollup)}`, value: fmtMoney(rollup.spendCents) },
    { label: `Revenue · ${rollup.bookings} ${rollup.bookings === 1 ? "result" : "results"}`, value: fmtMoney(rollup.revenueCents) },
    { label: "Return on ad spend", value: roas === null ? "—" : `${roas.toFixed(1)}×`, up: roas !== null && roas >= 2 },
    {
      label: `CTR · ${(benchmark * 100).toFixed(1)}% is typical`,
      value: fmtPct(avgCtr),
      up: avgCtr !== null && avgCtr >= benchmark,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Results</span>
          <h1>Results</h1>
          <p className="context">What each campaign did, as your ad account reports it.</p>
        </div>
      </div>

      {anything && (
        <div className="res__stats">
          {stats.map((s) => (
            <div key={s.label} className="res__stat">
              <span className={`res__num${s.up ? " is-up" : ""}`}>{s.value}</span>
              <span className="res__label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {takeaway && <p className="res__read">{takeaway}</p>}
      {rollup.tests > 0 && (
        <p className="res__read">
          {rollup.tests === 1 ? "One creative test" : `${rollup.tests} creative tests`} ended with numbers and{" "}
          {rollup.tests === 1 ? "is" : "are"} counted above.{" "}
          <Link href="/app/campaigns">Every test</Link> · <Link href="/app/record">Track record</Link>
        </p>
      )}

      {liveOnes.length === 0 && !anything && (
        <div className="panel res__empty">
          <p>Nothing recorded yet. Results land here once a campaign is launched or a test ends with numbers.</p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            This week&apos;s picks
          </Link>
        </div>
      )}

      {liveOnes.length > 0 && (
        <section className="res__section" aria-labelledby="res-live">
          <div className="res__section-head">
            <span id="res-live" className="eyebrow m-0">
              Waiting on results
            </span>
            <span className="res__count">{liveOnes.length}</span>
          </div>
          <div className="res__live">
            {liveOnes.map((c) => (
              <div key={c.id} className="res__live-row">
                <div className="res__live-head">
                  <Link className="res__live-title" href={`/app/campaigns/${c.id}`}>
                    <span className="res__term">{sentenceCase(c.hook)}</span>
                    <span className="res__line">{c.angle}</span>
                  </Link>
                  <span className="badge badge--mint">
                    <i />
                    Live since {shortDate(c.created_at)}
                  </span>
                </div>
                <ResultEntryForm campaignId={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="res__section" aria-labelledby="res-recorded">
          <div className="res__section-head">
            <span id="res-recorded" className="eyebrow m-0">
              Recorded
            </span>
            <span className="res__count">{results.length}</span>
          </div>
          <div className="res__table-wrap">
            <table className="res__table">
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
                  return (
                    <tr key={r.id}>
                      <td className="res__campaign">
                        {c ? (
                          <Link href={`/app/campaigns/${c.id}`} title={c.hook}>
                            {sentenceCase(c.hook)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="res__date">{shortDate(r.recorded_at)}</td>
                      <td className="num">{fmtNum(r.impressions)}</td>
                      <td className="num">{fmtNum(r.clicks)}</td>
                      <td className="num">{fmtPct(r.ctr === null ? null : Number(r.ctr))}</td>
                      <td className="num">{fmtMoney(r.spend_cents)}</td>
                      <td className="num">{fmtMoney(r.cpa_cents)}</td>
                      <td className="num">{fmtNum(r.bookings)}</td>
                      <td className="num">{fmtMoney(r.revenue_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {learnings.length > 0 && (
        <section className="res__section" aria-labelledby="res-learnings">
          <div className="res__section-head">
            <span id="res-learnings" className="eyebrow m-0">
              What converts in {sentenceCase(business.category)}
            </span>
          </div>
          <div className="res__pills">
            {learnings.map((l) => (
              <span key={l.id} className="pill" title={`${l.sample_size} recorded ${l.sample_size === 1 ? "result" : "results"}`}>
                {sentenceCase(l.angle_type.replace(/_/g, " "))} · lift {Number(l.lift).toFixed(2)} · {l.sample_size}{" "}
                {l.sample_size === 1 ? "result" : "results"}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
