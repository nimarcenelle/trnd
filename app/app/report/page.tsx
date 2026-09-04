import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import GradePill from "@/components/app/grade-pill";
import PrintButton from "@/components/app/print-button";
import SourceBadge from "@/components/app/source-badge";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isGeminiConfigured } from "@/lib/env";
import { WEIGHTS } from "@/lib/scoring";
import { buildIntelReport } from "@/lib/report/build";
import {
  buildFallbackIntelNote,
  generateIntelNote,
  INTEL_NOTE_FALLBACK_MODEL,
  INTEL_NOTE_PROMPT_VERSION,
} from "@/lib/report/note";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { titleCase } from "@/lib/text";

export const metadata = { title: "Intel report — TRND" };

function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

/**
 * The weekly report, owner-first: what to do, then why, then the sections an
 * owner actually acts on (picks, rivals, customer voice, calendar, results).
 * The analyst layer — demand tables, category pulse, methodology — lives in
 * a collapsed appendix: one click away, never in the way, out of the PDF.
 */
export default async function ReportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  // The report reads this week's ranking — make sure one exists first.
  const week = weekOf();
  if ((await repo.listOpportunities(business.id, week)).length === 0) {
    await recommendForBusiness(repo, business);
  }
  // Businesses whose Google listing was never resolved get their intel
  // pulled in the background — voice-of-customer fills in on the next view.
  after(async () => {
    try {
      const { ensureIntelFresh } = await import("@/lib/intel/ingest");
      await ensureIntelFresh(repo, business);
    } catch (err) {
      console.warn("[report] intel self-heal failed (non-fatal):", (err as Error).message);
    }
  });

  const report = await buildIntelReport(repo, business);

  // The analyst note: stored per week; written in the background on first
  // view (a fallback template upgrades to the real note once Gemini runs).
  const stored = await repo.getIntelNote(business.id, report.week);
  if (
    !stored ||
    stored.prompt_version !== INTEL_NOTE_PROMPT_VERSION ||
    (stored.model_used === INTEL_NOTE_FALLBACK_MODEL && isGeminiConfigured)
  ) {
    after(async () => {
      try {
        await repo.upsertIntelNote(await generateIntelNote(business, report));
      } catch (err) {
        console.warn("[report] note refresh failed (non-fatal):", (err as Error).message);
      }
    });
  }
  const note =
    stored && stored.prompt_version === INTEL_NOTE_PROMPT_VERSION
      ? stored
      : buildFallbackIntelNote(business, report);

  const weekRange = `${fmtDate(report.week)} – ${fmtDate(report.weekEnd)}`;
  const generated = new Date(report.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const brief = report.brief;

  return (
    <div className="page report">
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>Weekly report · {weekRange}</span>
          <h1>{business.name} — your week.</h1>
          <p className="context">
            <b>{business.category}</b> · {business.city}
            {business.region ? `, ${business.region}` : ""} · {business.radius_miles}-mile radius ·
            generated {generated}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} className="no-print">
          <PrintButton />
          <Link href="/app" className="btn btn-ghost btn-sm">
            This week&apos;s dashboard →
          </Link>
        </div>
      </div>

      {/* ---------- THE WEEK, OWNER-FIRST: what to do, then why ---------- */}
      <section className="panel panel--hero" style={{ padding: "28px 32px 24px" }}>
        <span className="mono-label" style={{ display: "block", marginBottom: 12 }}>This week</span>
        <h2 className="h-disp" style={{ fontSize: "clamp(22px,2.6vw,30px)", margin: "0 0 18px", lineHeight: 1.15 }}>
          {note.headline}
        </h2>
        {note.actions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {note.actions.map((a, i) => (
              <div
                key={a.slice(0, 40)}
                className="report-action"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  fontSize: 15,
                  lineHeight: 1.55,
                  fontWeight: 500,
                  background: "var(--bg-1)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 16px",
                }}
              >
                <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, color: "var(--amber-text)", flex: "0 0 20px" }}>
                  {i + 1}
                </span>
                {a}
              </div>
            ))}
          </div>
        )}
        <details>
          <summary className="mono-label" style={{ cursor: "pointer" }}>Why — the one-minute read</summary>
          {note.narrative.map((p) => (
            <p key={p.slice(0, 40)} style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-soft)", margin: "10px 0 0", maxWidth: 760 }}>
              {p}
            </p>
          ))}
        </details>
        <p style={{ margin: "18px 0 0", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>
          {note.model_used === INTEL_NOTE_FALLBACK_MODEL
            ? "Assembled from this week's data — upgrades to the written note automatically."
            : "From this week's data only — every claim traces to the sections below."}
        </p>
      </section>

      {/* ---------- RANKED OPPORTUNITIES ---------- */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel__head">
          <span className="panel__title">This week&apos;s picks, ranked</span>
          <span className="panel__meta">every row judged against what you actually sell</span>
        </div>
        {report.ranked.length === 0 && (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-faint)" }}>
            No scorable signal captured yet — the ranking appears as soon as ingestion lands signal for your category.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {report.ranked.map((r, i) => (
            <div
              key={r.opportunityId}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                padding: "14px 0",
                borderBottom: i < report.ranked.length - 1 ? "1px dashed var(--line)" : "none",
              }}
            >
              <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--ink-faint)", fontSize: 14, width: 26, paddingTop: 2 }}>
                #{r.rank}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15 }}>{titleCase(r.term)}</span>
                  <SourceBadge source={r.source} metric={r.metric} />
                  {typeof r.deltaPct === "number" && <span className="delta-chip">↑{Math.round(r.deltaPct)}%</span>}
                  {r.hasCampaign && (
                    <span className="badge badge--mint"><i />campaign built</span>
                  )}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--ink-soft)", maxWidth: 700 }}>
                  {r.matchedServiceName ? `Matches your ${r.matchedServiceName}. ` : ""}
                  {r.snapshotReason ?? ""}
                  {r.competitorGap ? ` ${r.competitorGap.charAt(0).toUpperCase()}${r.competitorGap.slice(1)}.` : ""}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <GradePill score={r.score} lead={r.rank === 1} />
                <span className="mono-label">{r.score.toFixed(1)}/10</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- COMPETITOR MOVES (named rivals) ---------- */}
      {report.competitorsWatched.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title">Competitor moves</span>
            <span className="panel__meta">the rivals you named, read daily</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {report.competitorsWatched.map((w) => (
              <div key={w.name} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14 }}>{w.name}</span>
                  {w.reviews && (
                    <span className="mono-label" style={{ whiteSpace: "nowrap" }}>
                      {w.reviews.rating ?? "—"}★ · {w.reviews.count ?? 0} reviews
                    </span>
                  )}
                </div>
                {w.ads ? (
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--ink)" }}>
                    {w.ads.summary.charAt(0).toUpperCase()}
                    {w.ads.summary.slice(1)}
                    {w.previousAdCount !== null &&
                      w.previousAdCount !== w.ads.count &&
                      (w.ads.count ?? 0) <= 300 &&
                      w.previousAdCount <= 300 && (
                        <span style={{ color: "var(--amber-text)" }}> (was {w.previousAdCount} a week ago)</span>
                      )}
                    <span className="mono-label"> · {fmtDate(w.ads.day)}</span>
                  </p>
                ) : (
                  <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-faint)" }}>
                    <span className="report-none">no ad read yet</span> — first read lands with the next daily scan
                  </p>
                )}
                {w.ads?.creatives.map((ad) => (
                  <p key={ad.snippet.slice(0, 40)} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)", margin: "0 0 6px" }}>
                    “{ad.snippet.length > 100 ? `${ad.snippet.slice(0, 97)}…` : ad.snippet}”
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- VOICE OF CUSTOMER ---------- */}
      {report.voice && report.voice.review_count > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title mint">What your customers say</span>
            <span className="panel__meta">from {report.voice.review_count} of your Google reviews</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            <div>
              <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>What they praise</span>
              {report.voice.themes.map((t) => (
                <p key={t.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 6px" }}>· {t}</p>
              ))}
            </div>
            <div>
              <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Their words — use in ads</span>
              {report.voice.copy_hooks.map((t) => (
                <p key={t.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink)", margin: "0 0 6px" }}>“{t}”</p>
              ))}
            </div>
            {report.voice.watchouts.length > 0 && (
              <div>
                <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Don&apos;t overpromise</span>
                {report.voice.watchouts.map((t) => (
                  <p key={t.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 6px" }}>· {t}</p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- CALENDAR AHEAD ---------- */}
      {report.seasonal.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title">Coming up — plan ahead</span>
            <span className="panel__meta">known demand moments</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {report.seasonal.map((m) => (
              <div key={m.label} style={{ borderLeft: `2px solid ${m.prepNow ? "var(--amber)" : "var(--line-strong)"}`, paddingLeft: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 13.5 }}>{m.label}</span>
                  <span className="mono-label" style={{ color: m.prepNow ? "var(--amber-text)" : undefined, whiteSpace: "nowrap" }}>
                    {m.daysOut <= 1 ? "now" : `${m.daysOut}d out`}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>{m.advice}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- RESULTS ---------- */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel__head">
          <span className="panel__title">Results to date</span>
          <Link href="/app/results" className="panel__meta no-print" style={{ color: "var(--amber-text)" }}>
            record results →
          </Link>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 760 }}>
          {report.results.totalCampaigns === 0
            ? "No campaigns yet — your first one is a click away on the dashboard."
            : `${report.results.launched} of ${report.results.totalCampaigns} generated campaign${report.results.totalCampaigns === 1 ? "" : "s"} launched.`}{" "}
          {report.results.avgCtr !== null && `Average CTR ${pct(report.results.avgCtr)} against a ~${pct(report.results.benchmark)} category-typical benchmark.`}{" "}
          {report.results.takeaway ?? ""}
        </p>
      </section>

      {/* ---------- APPENDIX: the analyst layer, one click away ---------- */}
      <details className="report-appendix">
        <summary>
          The full data — every number, source, and date behind this report
          <span className="mono-label" style={{ marginLeft: 10 }}>
            {report.signalsWatched} signals · {report.sourceCounts.length} sources · {report.demand.length} demand terms
          </span>
        </summary>

        {report.demand.length > 0 && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel__head">
              <span className="panel__title mint">Demand tracker</span>
              <span className="panel__meta">your snapshot&apos;s watch terms, read daily</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Search interest</th>
                    <th>Local news</th>
                    <th>Competing ads</th>
                    <th>Last read</th>
                  </tr>
                </thead>
                <tbody>
                  {report.demand.map((d) => (
                    <tr key={d.term}>
                      <td style={{ fontFamily: "var(--disp)", fontWeight: 600 }}>{titleCase(d.term)}</td>
                      <td>
                        {d.interestLevel !== null && !d.interestSparse ? (
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                            {typeof d.deltaPct === "number" && (
                              <span className="delta-chip">{d.deltaPct >= 0 ? "↑" : "↓"}{Math.abs(Math.round(d.deltaPct))}%</span>
                            )}
                            <span>
                              {d.interestLevel}/100
                              {d.interestRange && (
                                <span className="mono-cell" style={{ marginLeft: 6 }}>
                                  90d {d.interestRange.min}–{d.interestRange.max}
                                </span>
                              )}
                              {d.interestMeasuredAs && (
                                <span className="mono-cell" style={{ marginLeft: 6 }}>as “{d.interestMeasuredAs}”</span>
                              )}
                            </span>
                          </span>
                        ) : d.interestSparse ? (
                          <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                            niche term — steady trickle
                            {d.interestMeasuredAs && (
                              <span className="mono-cell" style={{ marginLeft: 6 }}>even as “{d.interestMeasuredAs}”</span>
                            )}
                          </span>
                        ) : (
                          <span className="report-none">read landing with tomorrow&apos;s scan</span>
                        )}
                      </td>
                      <td>
                        {typeof d.coverageCount === "number" ? (
                          `${d.coverageCount} mention${d.coverageCount === 1 ? "" : "s"}`
                        ) : (
                          <span className="report-none">no read yet</span>
                        )}
                      </td>
                      <td>
                        {typeof d.adCount === "number" ? (
                          d.adCount > 300 ? (
                            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                              broad term<span className="mono-cell" style={{ marginLeft: 6 }}>{d.adCount} matches nationally</span>
                            </span>
                          ) : (
                            `${d.adCount} active${d.adCount <= 5 ? " · open ground" : ""}`
                          )
                        ) : (
                          <span className="report-none">no read yet</span>
                        )}
                      </td>
                      <td className="mono-cell">{d.lastRead ? fmtDate(d.lastRead) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report.competitors.length > 0 && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel__head">
              <span className="panel__title">Ads running on your terms</span>
              <span className="panel__meta">live Meta Ad Library reads near you</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {report.competitors.map((c) => (
                <div key={c.term} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 13.5 }}>{titleCase(c.term)}</span>
                    <span className="mono-label" style={{ whiteSpace: "nowrap" }}>
                      {c.adCount > 300 ? `${c.adCount} national matches` : `${c.adCount} ad${c.adCount === 1 ? "" : "s"}`} · {fmtDate(c.capturedAt)}
                    </span>
                  </div>
                  {c.ads.length === 0 && (
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-faint)" }}>No competitor is running ads on this — open ground.</p>
                  )}
                  {c.ads.map((ad) => (
                    <p key={ad.advertiser} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                      <b style={{ color: "var(--ink)" }}>{ad.advertiser}</b> — “
                      {ad.snippet.length > 110 ? `${ad.snippet.slice(0, 107)}…` : ad.snippet}”
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {report.movers.length > 0 && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel__head">
              <span className="panel__title mint">Category pulse · 7d</span>
              <span className="panel__meta">context, not picks</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {report.movers.map((m, i) => (
                <div
                  key={`${m.term}-${m.source}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "baseline",
                    padding: "9px 0",
                    borderBottom: i < report.movers.length - 1 ? "1px dashed var(--line)" : "none",
                  }}
                >
                  <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{titleCase(m.term)}</span>
                  <span className="delta-chip">↑{Math.round(m.deltaPct)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel__head">
              <span className="panel__title">How TRND positions you</span>
              <Link href="/app/snapshot" className="panel__meta no-print" style={{ color: "var(--amber-text)" }}>
                full analysis →
              </Link>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.65, color: "var(--ink-soft)", maxWidth: 760 }}>
              {brief.positioning}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
              <div>
                <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Edges to press</span>
                {brief.advantages.slice(0, 3).map((a) => (
                  <p key={a.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 6px" }}>· {a}</p>
                ))}
              </div>
              <div>
                <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Never do</span>
                {brief.watchouts.slice(0, 3).map((w) => (
                  <p key={w.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 6px" }}>· {w}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel__head">
            <span className="panel__title">Methodology &amp; sources</span>
            <span className="panel__meta">every number on this page is traceable</span>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 760 }}>
            Scores weight momentum at {Math.round(WEIGHTS.normalizedDelta * 100)}%, fit to your menu at {Math.round(WEIGHTS.serviceMatch * 100)}%,
            competitor gap at {Math.round(WEIGHTS.competitorGap * 100)}%, and category track record at {Math.round(WEIGHTS.historicalLift * 100)}% —
            then a snapshot-aware judge gates the total by how credibly <i>your</i> business could run each trend. Competition marked
            “estimated” uses news coverage in place of a live ad-library read. Where no read has been captured, this report says so
            rather than estimating.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Signals · 14d</th>
                  <th>Latest capture</th>
                </tr>
              </thead>
              <tbody>
                {report.sourceCounts.map((s) => (
                  <tr key={s.source}>
                    <td><SourceBadge source={s.source} /></td>
                    <td>{s.count}</td>
                    <td className="mono-cell">{fmtDate(s.latest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <p style={{ margin: "18px 0 0", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>
        Generated {generated} · week of {fmtDate(report.week)} · TRND for {business.name}
      </p>
    </div>
  );
}
