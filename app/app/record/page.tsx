import "./record.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import HitRateChart from "@/components/record/hit-rate-chart";
import { readAdHistory } from "@/lib/ads/history-read";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { formatUsd } from "@/lib/picks/format";
import { shortDate } from "@/lib/picks/list";
import { OUTCOME_LABEL, OUTCOME_TONE } from "@/lib/record/outcome";
import { buildTrackRecord, hitRateLine, ratePct } from "@/lib/record/track";
import { weekOf } from "@/lib/recommend/week";
import { benchmarkFor } from "@/lib/results/benchmarks";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Track record — TRND" };

/**
 * The number the product is judged on. How many of the picks this brand
 * ran won, as it moved; what each grade actually did here; every run with
 * its outcome and the reason; and what this week was held back.
 */
export default async function TrackRecordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.warn("[record] read failed (non-fatal):", (err as Error).message);
      return fallback;
    }
  };
  const [runs, skips, history] = await Promise.all([
    safe(repo.listPickRuns(business.id), []),
    safe(repo.listWeekSkips(business.id, weekOf()), []),
    safe(repo.listAdHistory(business.id), []),
  ]);
  const accountCtr = readAdHistory(history).accountCtr;
  const record = buildTrackRecord(runs, { accountCtr, benchmarkCtr: benchmarkFor(business.category) });
  const judged = accountCtr ? "your own account average" : "the category average";

  const stats = [
    { label: `Hit rate · ${record.scored} scored`, value: ratePct(record.hitRate), hero: true },
    { label: "Picks run", value: String(record.runs) },
    { label: "Won", value: String(record.won) },
    { label: "Lost", value: String(record.lost) },
    { label: "Running now", value: String(record.open) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Track record</span>
          <h1>Track record</h1>
          <p className="context">How the tests you ran turned out, judged only by what you recorded.</p>
        </div>
      </div>

      {record.runs === 0 ? (
        <div className="panel rec__empty">
          <p>No tests have run yet. Choose a concept, mark it launched, and the record starts with the first one that ends with results.</p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            This week&apos;s picks
          </Link>
        </div>
      ) : (
        <>
          <div className="rec__stats">
            {stats.map((s) => (
              <div key={s.label} className={`rec__stat${s.hero ? " rec__stat--hero" : ""}`}>
                <span className="rec__num">{s.value}</span>
                <span className="rec__label">{s.label}</span>
              </div>
            ))}
          </div>
          <p className="rec__read">
            {hitRateLine(record) ?? "Nothing is scored yet: a run counts once it ends with your verdict or with numbers."}{" "}
            A run wins on your call, or on its numbers: return on spend of 1.5x or better, else click-through against {judged}. A
            killed run is a loss. A run closed with neither is counted, never scored.
          </p>
        </>
      )}

      {record.series.length >= 2 && (
        <section className="rec__section" aria-labelledby="rec-line">
          <div className="rec__section-head">
            <span id="rec-line" className="eyebrow m-0">
              Hit rate as it moved
            </span>
            <span className="rec__count">one point per scored run</span>
          </div>
          <div className="rec__chart-card">
            <HitRateChart points={record.series} />
          </div>
        </section>
      )}

      {record.byGrade.length > 0 && (
        <section className="rec__section" aria-labelledby="rec-grades">
          <div className="rec__section-head">
            <span id="rec-grades" className="eyebrow m-0">
              What each grade has done for you
            </span>
          </div>
          <div className="rec__table-wrap">
            <table className="rec__table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th className="num">Ran</th>
                  <th className="num">Won</th>
                  <th className="num">Lost</th>
                  <th>Hit rate</th>
                </tr>
              </thead>
              <tbody>
                {record.byGrade.map((g) => {
                  const rate = g.scored > 0 ? g.won / g.scored : null;
                  return (
                    <tr key={g.letter}>
                      <td className="rec__grade">{g.letter}</td>
                      <td className="num">{g.runs}</td>
                      <td className="num">{g.won}</td>
                      <td className="num">{g.scored - g.won}</td>
                      <td>
                        {rate === null ? (
                          <span className="rec__reason">Not scored yet</span>
                        ) : (
                          <>
                            <span className="rec__grade">{ratePct(rate)}</span>
                            <span className="rec__bar" aria-hidden="true">
                              <span style={{ width: `${Math.round(rate * 100)}%` }} />
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {record.rows.length > 0 && (
        <section className="rec__section" aria-labelledby="rec-runs">
          <div className="rec__section-head">
            <span id="rec-runs" className="eyebrow m-0">
              Every run
            </span>
            <span className="rec__count">{record.rows.length}</span>
          </div>
          <div className="rec__table-wrap">
            <table className="rec__table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Grade</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th className="num">Spend</th>
                  <th>Outcome</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {record.rows.map((r) => (
                  <tr key={r.runId}>
                    <td>
                      <Link href={`/app/picks/${r.pickId}`}>{sentenceCase(r.term)}</Link>
                    </td>
                    <td className="rec__grade">{r.grade ?? "—"}</td>
                    <td>{shortDate(r.startedAt)}</td>
                    <td>{r.endedAt ? shortDate(r.endedAt) : "—"}</td>
                    <td className="num">{r.spendUsd === null ? "—" : formatUsd(r.spendUsd)}</td>
                    <td>
                      <span className={`badge badge--${OUTCOME_TONE[r.outcome]}`}>
                        <i />
                        {OUTCOME_LABEL[r.outcome]}
                      </span>
                    </td>
                    <td className="rec__reason">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {skips.length > 0 && (
        <section className="rec__section" aria-labelledby="rec-skips">
          <div className="rec__section-head">
            <span id="rec-skips" className="eyebrow m-0">
              Held this week
            </span>
            <span className="rec__count">{skips.length}</span>
          </div>
          <ul className="rec__skips">
            {skips.map((s) => (
              <li key={s.id} className="rec__skip">
                <p className="rec__skip-term">{sentenceCase(s.term)}</p>
                {s.grade && <span className="rec__count">{s.grade}</span>}
                <p className="rec__skip-line">{s.reason.replace(/\.?$/, ".")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
