import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AdCallCard from "@/components/app/ad-call-card";
import AutoRefresh from "@/components/app/auto-refresh";
import GradePill from "@/components/app/grade-pill";
import PrintButton from "@/components/app/print-button";
import DeltaChip from "@/components/app/delta-chip";
import SourceBadge from "@/components/app/source-badge";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import { isGeminiConfigured } from "@/lib/env";
import { WEIGHTS } from "@/lib/scoring";
import { buildIntelReport } from "@/lib/report/build";
import {
  buildFallbackIntelNote,
  generateIntelNote,
  INTEL_NOTE_FALLBACK_MODEL,
  noteFingerprint,
} from "@/lib/report/note";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { titleCase } from "@/lib/text";

import { isOnlineBusiness } from "@/lib/signals/geo";
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
  // Ranking writes shared tables RLS keeps read-only for user sessions, so
  // it runs on the service repo; a failed rank renders the report without
  // picks instead of the error boundary.
  const week = weekOf();
  if ((await repo.listOpportunities(business.id, week)).length === 0) {
    try {
      await recommendForBusiness(getAdminRepo(), business);
    } catch (err) {
      console.warn("[report] ranking failed (non-fatal):", (err as Error).message);
    }
  }
  // The report analyzes before it renders: if this business has no demand
  // reads or no listing yet, pull them now — an owner never opens a report
  // that tells them to wait for one.
  try {
    const { ensureIntelFresh } = await import("@/lib/intel/ingest");
    await ensureIntelFresh(getAdminRepo(), business);
  } catch (err) {
    console.warn("[report] intel refresh failed (non-fatal):", (err as Error).message);
  }

  const report = await buildIntelReport(repo, business);

  // The analyst note: stored per week; written in the background on first
  // view (a fallback template upgrades to the real note once Gemini runs).
  const stored = await repo.getIntelNote(business.id, report.week);
  const fingerprint = noteFingerprint(report);
  if (
    !stored ||
    stored.prompt_version !== fingerprint ||
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
    stored && stored.prompt_version === fingerprint ? stored : buildFallbackIntelNote(business, report);
  // The written note lands in the background a few seconds after this render.
  // Without a nudge the owner sits on the assembled version until they happen
  // to reload — which reads as the page being stuck, not as work in progress.
  const notePending = note.model_used === INTEL_NOTE_FALLBACK_MODEL && isGeminiConfigured;

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
          <span className="eyebrow m-0">Weekly report · {weekRange}</span>
          <h1>Weekly report</h1>
          <p className="context">
            <b>{titleCase(business.category)}</b> ·{" "}
            {isOnlineBusiness(business)
              ? "Online DTC brand, nationwide"
              : `${business.city}${business.region ? `, ${business.region}` : ""} · ${business.radius_miles}-mile radius`}{" "}
            · generated {generated}
          </p>
        </div>
        <div className="no-print flex items-center gap-[10px] flex-wrap">
          <PrintButton />
          <Link href="/app/picks" className="btn btn-ghost btn-sm">
            This week&apos;s dashboard
          </Link>
        </div>
      </div>

      {/* ---------- THE WEEK, OWNER-FIRST: what to do, then why ---------- */}
      <section className="panel panel--hero px-8 pt-7 pb-6">
        <span className="mono-label block mb-3">This week</span>
        <h2 className="h-disp" style={{ fontSize: "clamp(22px,2.6vw,30px)", margin: "0 0 18px", lineHeight: 1.15 }}>
          {note.headline}
        </h2>
        {note.actions.length > 0 && (
          <div className="flex flex-col gap-[10px] mb-5">
            {note.actions.map((a, i) => (
              <div
                key={a.slice(0, 40)}
                className="report-action flex gap-3 items-baseline text-[15px] leading-[1.55] font-medium bg-bg-1 border border-line rounded-card-sm py-3 px-4"
               
              >
                <span className="font-disp font-bold text-[14px] text-(--amber-text) flex-[0_0_20px]">
                  {i + 1}
                </span>
                {a}
              </div>
            ))}
          </div>
        )}
        <details>
          <summary className="mono-label cursor-pointer">Why</summary>
          {note.narrative.map((p) => (
            <p className="text-[14.5px] leading-[1.65] text-ink-soft mx-0 mt-[10px] mb-0 max-w-[760px]" key={p.slice(0, 40)}>
              {p}
            </p>
          ))}
        </details>
        <p className="mx-0 mt-[18px] mb-0 font-mono text-[10.5px] text-ink-faint">
          {notePending ? (
            <span className="note-writing">
              <i aria-hidden="true" />
              Straight from this week&apos;s data — the written read lands here in a few seconds.
            </span>
          ) : note.model_used === INTEL_NOTE_FALLBACK_MODEL ? (
            "Assembled from this week's data — every claim traces to the sections below."
          ) : (
            "From this week's data only — every claim traces to the sections below."
          )}
        </p>
        {notePending && <AutoRefresh everyMs={5000} times={12} />}
      </section>

      {/* ---------- THE CALL on the #1 pick ---------- */}
      {report.call && (
        <div className="mt-[18px]">
          <AdCallCard call={report.call} campaignId={report.callCampaignId ?? null} building={false} />
        </div>
      )}

      {/* ---------- RANKED OPPORTUNITIES ---------- */}
      <section className="panel mt-[18px]">
        <div className="panel__head">
          <span className="panel__title">Ranked picks</span>
          <span className="panel__meta">Judged against what you sell</span>
        </div>
        {report.ranked.length === 0 && (
          <p className="m-0 text-[13.5px] text-ink-faint">
            No trend beat your own menu this week — the move above comes from your positioning, rivals, and calendar instead.
          </p>
        )}
        <div className="flex flex-col">
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
              <span className="font-disp font-bold text-ink-faint text-[14px] w-[26px] pt-[2px]">
                #{r.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex gap-[10px] items-center flex-wrap">
                  <span className="font-disp font-semibold text-[15px]">{titleCase(r.term)}</span>
                  <SourceBadge source={r.source} metric={r.metric} href={r.sourceUrl} />
                  {typeof r.deltaPct === "number" && <DeltaChip delta={r.deltaPct} />}
                  {r.sparse && (
                    <span className="badge badge--faint" title="Google's regional sample for this term is mostly zeros — ranked as an idea that fits, not a measured trend">
                      <i />below Google&apos;s meter
                    </span>
                  )}
                  {r.hasCampaign && (
                    <span className="badge badge--mint"><i />Campaign built</span>
                  )}
                </div>
                <p className="mx-0 mt-[6px] mb-0 text-[13px] leading-[1.55] text-ink-soft max-w-[700px]">
                  {r.matchedServiceName ? `Matches your ${r.matchedServiceName}. ` : ""}
                  {r.snapshotReason ?? ""}
                  {r.competitorGap ? ` ${r.competitorGap.charAt(0).toUpperCase()}${r.competitorGap.slice(1)}.` : ""}
                </p>
              </div>
              {/* The letter IS the verdict — a second number under it just
                  invites reconciling two scales. */}
              <GradePill score={r.score} lead={r.rank === 1} />
            </div>
          ))}
        </div>
      </section>

      {/* ---------- COMPETITOR MOVES (named rivals) ---------- */}
      {report.competitorsWatched.length > 0 && (
        <section className="panel mt-[18px]">
          <div className="panel__head">
            <span className="panel__title">Competitor moves</span>
            <span className="panel__meta">Direct rivals first · read daily</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-4">
            {report.competitorsWatched.map((w) => (
              <div className="border border-line rounded-card-sm py-[14px] px-4" key={w.name}>
                <div className="flex justify-between gap-[10px] items-baseline mb-2">
                  <span className="font-disp font-semibold text-[14px]">{w.name}</span>
                  {w.reviews && (
                    <span className="mono-label whitespace-nowrap">
                      {w.reviews.rating ?? "—"}★ · {w.reviews.count ?? 0} reviews
                    </span>
                  )}
                </div>
                {w.directnessReason && (
                  <p className="mx-0 mt-0 mb-2 text-[12px] leading-[1.5] text-ink-faint">{w.directnessReason}</p>
                )}
                {w.ads ? (
                  <p className="mx-0 mt-0 mb-2 text-[13px] text-ink">
                    {w.ads.summary.charAt(0).toUpperCase()}
                    {w.ads.summary.slice(1)}
                    {w.previousAdCount !== null &&
                      w.previousAdCount !== w.ads.count &&
                      (w.ads.count ?? 0) <= 300 &&
                      w.previousAdCount <= 300 && (
                        <span className="text-(--amber-text)"> (was {w.previousAdCount} a week ago)</span>
                      )}
                    <span className="mono-label"> · {fmtDate(w.ads.day)}</span>
                  </p>
                ) : (
                  <p className="mx-0 mt-0 mb-2 text-[12.5px] text-ink-faint">
                    <span className="report-none">no ad read yet</span> — first read lands with the next daily scan
                  </p>
                )}
                {w.social && (
                  <p className="mx-0 mt-0 mb-2 text-[13px] text-ink">
                    {w.social.summary.charAt(0).toUpperCase()}
                    {w.social.summary.slice(1)}
                    <span className="mono-label"> · {fmtDate(w.social.day)}</span>
                  </p>
                )}
                {w.googleAds && (
                  <p className="mx-0 mt-0 mb-2 text-[13px] text-ink">
                    {w.googleAds.summary.charAt(0).toUpperCase()}
                    {w.googleAds.summary.slice(1)}
                    <span className="mono-label"> · {fmtDate(w.googleAds.day)}</span>
                  </p>
                )}
                {w.ads?.creatives.map((ad) => (
                  <p className="text-[12px] leading-[1.5] text-ink-soft mx-0 mt-0 mb-[6px]" key={ad.snippet.slice(0, 40)}>
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
        <section className="panel mt-[18px]">
          <div className="panel__head">
            <span className="panel__title mint">Customer reviews</span>
            <span className="panel__meta">From {report.voice.review_count} Google reviews</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(240px,_1fr))] gap-[18px]">
            <div>
              <span className="mono-label block mb-2">What they praise</span>
              {report.voice.themes.map((t) => (
                <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-[6px]" key={t.slice(0, 40)}>· {t}</p>
              ))}
            </div>
            <div>
              <span className="mono-label block mb-2">Their words — use in ads</span>
              {report.voice.copy_hooks.map((t) => (
                <p className="text-[12.5px] leading-[1.55] text-ink mx-0 mt-0 mb-[6px]" key={t.slice(0, 40)}>“{t}”</p>
              ))}
            </div>
            {report.voice.watchouts.length > 0 && (
              <div>
                <span className="mono-label block mb-2">Don&apos;t overpromise</span>
                {report.voice.watchouts.map((t) => (
                  <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-[6px]" key={t.slice(0, 40)}>· {t}</p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- CALENDAR AHEAD ---------- */}
      {report.seasonal.length > 0 && (
        <section className="panel mt-[18px]">
          <div className="panel__head">
            <span className="panel__title">Coming up</span>
            <span className="panel__meta">Known demand moments</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(240px,_1fr))] gap-[18px]">
            {report.seasonal.map((m) => (
              <div key={m.label} style={{ borderLeft: `2px solid ${m.prepNow ? "var(--amber)" : "var(--line-strong)"}`, paddingLeft: 12 }}>
                <div className="flex justify-between gap-[10px] items-baseline">
                  <span className="font-disp font-semibold text-[13.5px]">{m.label}</span>
                  <span className="mono-label" style={{ color: m.prepNow ? "var(--amber-text)" : undefined, whiteSpace: "nowrap" }}>
                    {m.daysOut <= 1 ? "now" : `${m.daysOut}d out`}
                  </span>
                </div>
                <p className="text-[12.5px] leading-[1.5] text-ink-soft mx-0 mt-1 mb-0">{m.advice}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- RESULTS ---------- */}
      <section className="panel mt-[18px]">
        <div className="panel__head">
          <span className="panel__title">Results to date</span>
          <Link href="/app/results" className="panel__meta no-print text-(--amber-text)">
            record results
          </Link>
        </div>
        <p className="m-0 text-[14px] leading-[1.6] text-ink-soft max-w-[760px]">
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
          <span className="mono-label ml-[10px]">
            {report.signalsWatched} signals · {report.sourceCounts.length} sources · {report.demand.length} demand terms
          </span>
        </summary>

        {report.demand.length > 0 && (
          <div className="panel mt-[14px]">
            <div className="panel__head">
              <span className="panel__title mint">Demand tracker</span>
              <span className="panel__meta">Your watch terms, read daily</span>
            </div>
            <div className="overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th title="Google's index: 100 = the term's own busiest day in the window. Compare direction, not height.">
                      Search interest <span className="font-normal text-ink-faint">· index vs own peak</span>
                    </th>
                    <th>Local news</th>
                    <th>Competing ads</th>
                    <th>Last read</th>
                  </tr>
                </thead>
                <tbody>
                  {report.demand.map((d) => (
                    <tr key={d.term}>
                      <td className="font-disp font-semibold">{titleCase(d.term)}</td>
                      <td>
                        {d.interestLevel !== null && !d.interestSparse ? (
                          <span className="inline-flex gap-2 items-baseline flex-wrap">
                            {typeof d.deltaPct === "number" && <DeltaChip delta={d.deltaPct} />}
                            <span>
                              {d.interestLevel}/100
                              {d.interestRange && (
                                <span className="mono-cell ml-[6px]">
                                  90d {d.interestRange.min}–{d.interestRange.max}
                                </span>
                              )}
                              {d.interestMeasuredAs && (
                                <span className="mono-cell ml-[6px]">as “{d.interestMeasuredAs}”</span>
                              )}
                            </span>
                          </span>
                        ) : d.interestSparse ? (
                          <span className="text-[12.5px] text-ink-soft">
                            niche term — steady trickle
                            {d.interestMeasuredAs && (
                              <span className="mono-cell ml-[6px]">even as “{d.interestMeasuredAs}”</span>
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
                        {typeof d.adMatchesUnusable === "number" ? (
                          <span className="text-[12.5px] text-ink-soft">
                            {d.adMatchesUnusable} keyword match{d.adMatchesUnusable === 1 ? "" : "es"}<span className="mono-cell ml-[6px]">unrelated advertisers</span>
                          </span>
                        ) : typeof d.adCount === "number" ? (
                          d.adCount > 300 ? (
                            <span className="text-[12.5px] text-ink-soft">
                              broad term<span className="mono-cell ml-[6px]">{d.adCount} matches nationally</span>
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
          <div className="panel mt-[14px]">
            <div className="panel__head">
              <span className="panel__title">Competitor ads</span>
              <span className="panel__meta">Meta Ad Library reads on your terms</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-4">
              {report.competitors.map((c) => (
                <div className="border border-line rounded-card-sm py-[14px] px-4" key={c.term}>
                  <div className="flex justify-between gap-[10px] items-baseline mb-2">
                    <span className="font-disp font-semibold text-[13.5px]">{titleCase(c.term)}</span>
                    <span className="mono-label whitespace-nowrap">
                      {c.estimate === null || c.adCount > 300
                        ? `${c.adCount} keyword matches`
                        : c.estimate === c.adCount
                          ? `${c.adCount} ad${c.adCount === 1 ? "" : "s"}`
                          : `≈${c.estimate} rival ad${c.estimate === 1 ? "" : "s"} of ${c.adCount} matches`} · {fmtDate(c.capturedAt)}
                    </span>
                  </div>
                  {c.ads.length === 0 && c.unrelated === 0 && (
                    <p className="m-0 text-[12.5px] text-ink-faint">No competitor is running ads on this — open ground.</p>
                  )}
                  {c.ads.length === 0 && c.unrelated > 0 && (
                    <p className="m-0 text-[12.5px] text-ink-faint">
                      None of the {c.unrelated} sampled ads is a competitor of yours — other industries or spam matching the words. Competition on this term is unknown, not open.
                    </p>
                  )}
                  {c.ads.length > 0 && c.unrelated > 0 && (
                    <p className="mx-0 mt-0 mb-2 text-[12px] text-ink-faint">
                      {c.unrelated} unrelated match{c.unrelated === 1 ? "" : "es"} dropped from the sample.
                    </p>
                  )}
                  {c.ads.map((ad) => (
                    <p className="text-[12.5px] leading-[1.5] text-ink-soft mx-0 mt-0 mb-2" key={ad.advertiser}>
                      <b className="text-ink">{ad.advertiser}</b> — “
                      {ad.snippet.length > 110 ? `${ad.snippet.slice(0, 107)}…` : ad.snippet}”
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {report.movers.length > 0 && (
          <div className="panel mt-[14px]">
            <div className="panel__head">
              <span className="panel__title mint">Market movement</span>
              <span className="panel__meta">Context</span>
            </div>
            <div className="flex flex-col">
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
                  <span className="text-[13.5px] leading-[1.4]">{titleCase(m.term)}</span>
                  <DeltaChip delta={m.deltaPct} />
                </div>
              ))}
            </div>
          </div>
        )}

        {brief && (
          <div className="panel mt-[14px]">
            <div className="panel__head">
              <span className="panel__title">Positioning</span>
              <Link href="/app/snapshot" className="panel__meta no-print text-(--amber-text)">
                full analysis
              </Link>
            </div>
            <p className="mx-0 mt-0 mb-4 text-[14px] leading-[1.65] text-ink-soft max-w-[760px]">
              {brief.positioning}
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(260px,_1fr))] gap-[18px]">
              <div>
                <span className="mono-label block mb-2">Edges to press</span>
                {brief.advantages.slice(0, 3).map((a) => (
                  <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-[6px]" key={a.slice(0, 40)}>· {a}</p>
                ))}
              </div>
              <div>
                <span className="mono-label block mb-2">Never do</span>
                {brief.watchouts.slice(0, 3).map((w) => (
                  <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-[6px]" key={w.slice(0, 40)}>· {w}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="panel mt-[14px]">
          <div className="panel__head">
            <span className="panel__title">Sources</span>
            <span className="panel__meta">Every number links to its source</span>
          </div>
          <p className="mx-0 mt-0 mb-[14px] text-[13px] leading-[1.6] text-ink-soft max-w-[760px]">
            Scores weight momentum at {Math.round(WEIGHTS.normalizedDelta * 100)}%, fit to your menu at {Math.round(WEIGHTS.serviceMatch * 100)}%,
            competitor gap at {Math.round(WEIGHTS.competitorGap * 100)}%, and category track record at {Math.round(WEIGHTS.historicalLift * 100)}% —
            then a snapshot-aware judge gates the total by how credibly <i>your</i> business could run each trend. Competition marked
            “estimated” uses news coverage in place of a live ad-library read. Where no read has been captured, this report says so
            rather than estimating.
          </p>
          <div className="overflow-x-auto">
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

      <p className="mx-0 mt-[18px] mb-0 font-mono text-[10.5px] text-ink-faint">
        Generated {generated} · week of {fmtDate(report.week)} · TRND for {business.name}
      </p>
    </div>
  );
}
