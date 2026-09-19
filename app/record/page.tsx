import "@/app/app/app.css";
import "@/app/app/record/record.css";

import Link from "next/link";

import Brand from "@/components/brand";
import HitRateChart from "@/components/record/hit-rate-chart";
import { getAdminRepo } from "@/lib/db/admin";
import { buildPublicRecord } from "@/lib/record/public";
import { fidelityLine, ratePct, type TrackRecord } from "@/lib/record/track";

export const metadata = { title: "The record — TRND", description: "Every creative test TRND briefed, and how it turned out." };
export const revalidate = 3600;

/**
 * The public track record: every brief TRND wrote that a brand ran, summed
 * across every brand with nothing named. The number is what it is. Nobody
 * else in the category shows one.
 */
export default async function PublicRecordPage() {
  const record = await buildPublicRecord(getAdminRepo()).catch(() => null);
  const empty = !record || record.runs === 0;
  const split = record ? fidelityLine({ byFidelity: record.byFidelity } as TrackRecord) : null;
  const stats = record
    ? [
        { label: `Hit rate · ${record.scored} scored`, value: ratePct(record.hitRate), hero: true },
        { label: "Tests run", value: String(record.runs) },
        { label: "Won", value: String(record.won) },
        { label: "Lost", value: String(record.lost) },
        { label: "Brands", value: String(record.brands) },
      ]
    : [];
  return (
    <main className="min-h-dvh">
      <div className="page">
        <header className="shared__head">
          <Brand href="/" size={16} />
          <span className="mono-label">The record, in public</span>
        </header>
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">Track record</span>
            <h1>Every test we briefed, and how it turned out.</h1>
            <p className="context">
              Summed across every brand on TRND, nothing named. A test is scored only when it ended with the brand&apos;s verdict
              or with numbers; a killed test is a loss; a test closed with neither is counted, never scored. Refreshed hourly.
            </p>
          </div>
        </div>

        {empty ? (
          <div className="panel rec__empty">
            <p>No test has ended yet. The first brief that runs to a result starts the record, and it will be shown here whatever it says.</p>
            <Link href="/#pilot" className="btn btn-primary btn-sm">
              The pilot
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
              A test wins on the brand&apos;s call, or on its numbers: return on spend of 1.5x or better, else click-through against
              the brand&apos;s own account average. {record.open > 0 ? `${record.open} ${record.open === 1 ? "test is" : "tests are"} running now.` : ""}
            </p>
            {record.series.length >= 2 && (
              <section className="rec__section" aria-labelledby="rec-line">
                <div className="rec__section-head">
                  <span id="rec-line" className="eyebrow m-0">
                    Hit rate as it moved
                  </span>
                  <span className="rec__count">one point per scored test, every brand</span>
                </div>
                <div className="rec__chart-card">
                  <HitRateChart points={record.series} />
                </div>
              </section>
            )}
            {(record.byFidelity.followed.runs > 0 || record.byFidelity.strayed.runs > 0) && (
              <section className="rec__section" aria-labelledby="rec-fidelity">
                <div className="rec__section-head">
                  <span id="rec-fidelity" className="eyebrow m-0">
                    The idea or the shoot
                  </span>
                  <span className="rec__count">tests checked against their brief</span>
                </div>
                <div className="rec__table-wrap">
                  <table className="rec__table">
                    <thead>
                      <tr>
                        <th>The ad</th>
                        <th className="num">Ran</th>
                        <th className="num">Won</th>
                        <th className="num">Lost</th>
                        <th>Hit rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Followed the brief", record.byFidelity.followed],
                          ["Strayed from the brief", record.byFidelity.strayed],
                        ] as const
                      ).map(([label, t]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td className="num">{t.runs}</td>
                          <td className="num">{t.won}</td>
                          <td className="num">{t.scored - t.won}</td>
                          <td>{t.scored === 0 ? <span className="rec__reason">Not scored yet</span> : <span className="rec__grade">{ratePct(t.won / t.scored)}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {split && <p className="rec__read">{split}</p>}
              </section>
            )}
          </>
        )}
        <footer className="shared__foot mono-label">
          Briefs are hypotheses, not winners. TRND does not promise results. It promises the reason for each test, the record of
          what happened, and the next brief.
        </footer>
      </div>
    </main>
  );
}
