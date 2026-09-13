import "./report.css";

import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AdCallCard from "@/components/app/ad-call-card";
import AutoRefresh from "@/components/app/auto-refresh";
import PrintButton from "@/components/app/print-button";
import SourceBadge from "@/components/app/source-badge";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import { isGeminiConfigured } from "@/lib/env";
import { gradeTone } from "@/lib/picks/grade-view";
import { dueForKick, truncateFinding } from "@/lib/picks/list";
import { buildIntelReport, type RankedRow, type WatchedCompetitor } from "@/lib/report/build";
import {
  buildFallbackIntelNote,
  generateIntelNote,
  INTEL_NOTE_FALLBACK_MODEL,
  noteFingerprint,
} from "@/lib/report/note";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { proofName } from "@/lib/signals/source-url";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Weekly report — TRND" };

/** One ranking-and-read pass per business per instance per window: the page
 * refreshes itself every few seconds while the note lands, and each refresh
 * must not start the pass again. */
const freshKicks = new Map<string, number>();
const FRESH_KICK_WINDOW_MS = 10 * 60_000;
const requestTime = () => Date.now();

function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** "What moved" shows at most this many rows; build.ts already caps movers. */
const MOVES_MAX = 8;
/** An ad count above this is a franchise-scale keyword total, not a rival's count. */
const AD_COUNT_MAX = 300;

/**
 * The weekly report, read like the pick page: the call in the headline, this
 * week's moves, the ad to run, then the ranked picks as rows, what moved, and
 * the rivals. Every number is data from build.ts; the only written prose is
 * the note. The model behind the grades is explained on the pick page's
 * Signal read, not here.
 */
export default async function ReportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  // The report reads this week's ranking and this week's demand reads. When
  // either is missing they are written AFTER this response, never inside it:
  // a ranking is a model call and a demand read is minutes of scrapes, and a
  // page that waited on them held a blank tab for as long as that took. The
  // page renders what exists now and refreshes itself while the rest lands.
  // Ranking writes shared tables RLS keeps read-only for user sessions, so
  // it runs on the service repo.
  const week = weekOf();
  const ranked = (await repo.listOpportunities(business.id, week)).length > 0;
  const now = requestTime();
  if (dueForKick(freshKicks.get(business.id), now, FRESH_KICK_WINDOW_MS)) {
    freshKicks.set(business.id, now);
    after(async () => {
      const admin = getAdminRepo();
      if (!ranked) {
        try {
          await recommendForBusiness(admin, business);
        } catch (err) {
          console.warn("[report] ranking failed (non-fatal):", (err as Error).message);
        }
      }
      try {
        const { ensureIntelFresh } = await import("@/lib/intel/ingest");
        await ensureIntelFresh(admin, business);
      } catch (err) {
        console.warn("[report] intel refresh failed (non-fatal):", (err as Error).message);
      }
    });
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
  const notePending = (note.model_used === INTEL_NOTE_FALLBACK_MODEL && isGeminiConfigured) || !ranked;

  const weekRange = `${fmtDate(report.week)} – ${fmtDate(report.weekEnd)}`;
  const generated = new Date(report.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const market = isOnlineBusiness(business)
    ? "Online DTC brand, nationwide"
    : `${business.city}${business.region ? `, ${business.region}` : ""} · ${business.radius_miles}-mile radius`;
  const seen = new Set<string>();
  const moves = report.movers.filter((m) => (seen.has(m.term) ? false : (seen.add(m.term), true))).slice(0, MOVES_MAX);

  return (
    <div className="page rpt">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Weekly report · {weekRange}</span>
          <h1>{note.headline}</h1>
          <p className="context">
            <b>{sentenceCase(business.category)}</b> · {market}
          </p>
        </div>
        <div className="no-print flex items-center gap-[10px] flex-wrap">
          <PrintButton />
          <Link href="/app/picks" className="btn btn-ghost btn-sm">
            This week&apos;s picks
          </Link>
        </div>
      </div>

      <section className="panel rpt-card" aria-labelledby="rpt-week">
        <span id="rpt-week" className="eyebrow">
          This week
        </span>
        {note.actions.length > 0 && (
          <ol className="rpt-actions">
            {note.actions.map((a, i) => (
              <li key={a.slice(0, 40)}>
                <span className="rpt-actions__n" aria-hidden="true">
                  {i + 1}
                </span>
                {a.replace(/^\s*\d+[.)]\s*/, "")}
              </li>
            ))}
          </ol>
        )}
        {note.narrative.length > 0 && (
          <details className="rpt-why">
            <summary>Why</summary>
            {note.narrative.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </details>
        )}
        {notePending && (
          <p className="rpt-status">
            <span className="note-writing">
              <i aria-hidden="true" />
              The written read lands here in a few seconds.
            </span>
          </p>
        )}
        {notePending && <AutoRefresh everyMs={5000} times={36} />}
      </section>

      {report.call && (
        <section className="panel rpt-card rpt-call" aria-labelledby="rpt-call">
          <span id="rpt-call" className="eyebrow">
            The call
          </span>
          <AdCallCard call={report.call} campaignId={report.callCampaignId ?? null} building={false} />
        </section>
      )}

      <section className="panel rpt-card" aria-labelledby="rpt-ranked">
        <span id="rpt-ranked" className="eyebrow">
          Ranked picks
        </span>
        {report.ranked.length === 0 ? (
          <p className="rpt-card__empty">
            No trend beat your own range this week; the moves above come from your positioning, rivals and calendar.
            <Link href="/app/picks" className="btn btn-ghost btn-sm no-print">
              See this week&apos;s picks
            </Link>
          </p>
        ) : (
          <ol className="rpt-rows" aria-label={`Ranked picks for ${weekRange}`}>
            {report.ranked.map((r) => (
              <li key={r.opportunityId}>
                <RankedPick row={r} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {moves.length > 0 && (
        <section className="panel rpt-card" aria-labelledby="rpt-moved">
          <span id="rpt-moved" className="eyebrow">
            What moved
          </span>
          <ul className="rpt-moves">
            {moves.map((m) => {
              const proof = proofName(m.source);
              return (
                <li key={`${m.term}-${m.source}`}>
                  {m.sourceUrl ? (
                    <a
                      className="rpt-moves__term"
                      href={m.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={proof ? `See it for yourself on ${proof}` : undefined}
                    >
                      {sentenceCase(m.term)}
                    </a>
                  ) : (
                    <span className="rpt-moves__term">{sentenceCase(m.term)}</span>
                  )}
                  <Delta delta={m.deltaPct} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {report.competitorsWatched.length > 0 && (
        <section className="panel rpt-card" aria-labelledby="rpt-rivals">
          <span id="rpt-rivals" className="eyebrow">
            Competitors
          </span>
          <ul className="rpt-rows rpt-rows--plain">
            {report.competitorsWatched.map((w) => (
              <li key={w.name}>
                <Competitor rival={w} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="rpt-foot">Generated {generated} · every number links to its source</p>
    </div>
  );
}

/** "↑22% vs last week" in mono; the arrow carries the direction's color. */
function Delta({ delta }: { delta: number }) {
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
  return (
    <span className={`rpt-num is-${dir}`}>
      <span className="rpt-num__arrow" aria-hidden="true">
        {arrow}
      </span>
      {Math.abs(Math.round(delta))}% <span className="rpt-num__window">vs last week</span>
    </span>
  );
}

/** Rank, the term, one line of rationale, then the grade, the delta and the
 * one source badge. The competition read stays off the row: build.ts nulls
 * it when it was not measured, and the pick page says what was factored in. */
function RankedPick({ row: r }: { row: RankedRow }) {
  const line = truncateFinding(
    `${r.matchedServiceName ? `Matches your ${r.matchedServiceName}. ` : ""}${r.snapshotReason ?? ""}`,
  );
  return (
    <div className="rpt-row">
      <span className="rpt-row__rank" aria-hidden="true">
        {r.rank}
      </span>
      <span className="rpt-row__head">
        <span className="rpt-row__term">{sentenceCase(r.term)}</span>
        {line && <span className="rpt-row__line">{line}</span>}
      </span>
      <span className="rpt-row__meta">
        <span className="rpt-row__grade-cell">
          <span className={`picks-grade is-${gradeTone(r.grade.letter)}`} title={r.grade.label}>
            <span aria-hidden="true">{r.grade.letter}</span>
            <span className="sr-only">
              Grade {r.grade.letter}: {r.grade.label}
            </span>
          </span>
        </span>
        <span className="rpt-row__num">{typeof r.deltaPct === "number" && <Delta delta={r.deltaPct} />}</span>
        <span className="rpt-row__source">
          <SourceBadge source={r.source} metric={r.metric} href={r.sourceUrl} />
        </span>
      </span>
    </div>
  );
}

/** A named rival: the name, the latest read in one line, the ad count in mono. */
function Competitor({ rival: w }: { rival: WatchedCompetitor }) {
  const count = w.ads?.count ?? null;
  const countable = count !== null && count <= AD_COUNT_MAX;
  // The one line under the name says something the count does not: a
  // national advertiser is named as one, a bare "N active Meta ads" summary
  // duplicates the number and is dropped, and a scraper's aside never prints.
  const raw = w.social?.summary ?? w.googleAds?.summary ?? w.directnessReason ?? null;
  const read =
    count !== null && !countable
      ? "Advertises nationally, beyond the local read"
      : raw && !/keyword match|not a local count|^\d+ active meta ads?$/i.test(raw)
        ? raw
        : null;
  const previous =
    countable && w.previousAdCount !== null && w.previousAdCount <= AD_COUNT_MAX && w.previousAdCount !== count
      ? w.previousAdCount
      : null;
  return (
    <div className="rpt-row">
      <span className="rpt-row__head">
        <span className="rpt-row__term">{sentenceCase(w.name)}</span>
        {read && <span className="rpt-row__line">{truncateFinding(sentenceCase(read))}</span>}
      </span>
      <span className="rpt-row__num">
        {count !== null && (
          <span className="rpt-num">
            {countable ? `${count} active ad${count === 1 ? "" : "s"}` : `${AD_COUNT_MAX}+ ads`}
            {previous !== null && <span className="rpt-num__window"> · was {previous}</span>}
            {w.ads && <span className="rpt-num__window"> · {fmtDate(w.ads.day)}</span>}
          </span>
        )}
      </span>
    </div>
  );
}
