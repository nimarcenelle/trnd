import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

// The waiting states below have nothing on them to keep, and the whole page
// changes when the picks land, so they poll the page itself.
import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
import WeekClock from "@/components/app/week-clock";
import ListRow from "@/components/picks/list-row";
import {
  BRIEF_FALLBACK_MODEL,
  BRIEF_PROMPT_VERSION,
  briefLikelyInFlight,
  businessJustOnboarded,
  generateBusinessBrief,
} from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Alert } from "@/lib/db/types";
import { isEmailConfigured, isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { eligibleWeekOpportunities } from "@/lib/picks/generate";
import { kickWeekJob } from "@/lib/picks/kick";
import { weekProgress } from "@/lib/picks/progress";
import { dueForKick, weekRangeLabel } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

// Per-process memory of the last analysis refresh this page asked for.
const briefKicks = new Map<string, number>();
const BRIEF_KICK_WINDOW_MS = 15 * 60_000;

// The kick guards compare against wall time. Read once per request, outside
// the render body, so the component itself stays pure.
function requestTime(): number {
  return Date.now();
}

// The list page never calls a model on the request path, and never runs
// the week's chain itself: the week job does, one stage per invocation
// (lib/picks/advance-week.ts). This page reads what the week still needs
// and asks for the next stage.

function AlertBar({ alerts }: { alerts: Alert[] }) {
  // What changed since they last looked. One line, above everything: it is
  // the only thing on this screen that is news.
  if (alerts.length === 0) return null;
  return (
    <form action={markAlertsReadAction} className="alertbar">
      <span className="alertbar__dot" aria-hidden="true" />
      <p className="alertbar__text">
        <Link href={alerts[0].href}>{alerts[0].title}</Link>
        {alerts.length > 1 && (
          <span className="alertbar__more"> · {alerts.length - 1} more alert{alerts.length === 2 ? "" : "s"}</span>
        )}
      </p>
      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
        Mark read
      </SubmitButton>
    </form>
  );
}

export default async function PicksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  const weekRange = weekRangeLabel(week);
  const [rows, unreadAlerts, brief] = await Promise.all([
    repo.listReadyPicks(business.id, week),
    repo.listAlerts(business.id, { unreadOnly: true, limit: 5 }),
    repo.getBusinessBrief(business.id),
  ]);

  // Re-evaluate alerts after the response. Idempotent (deduped keys), so the
  // week's page doubles as the alert heartbeat between crons.
  after(async () => {
    try {
      const { evaluateAlerts } = await import("@/lib/alerts/engine");
      await evaluateAlerts(repo, business);
    } catch (err) {
      console.warn("[picks] alert evaluation failed (non-fatal):", (err as Error).message);
    }
  });

  // An analysis written by an older prompt, or the keyless template once a
  // key exists, is rewritten in the background. The week's picks stay put.
  const now = requestTime();
  if (
    brief &&
    (brief.prompt_version !== BRIEF_PROMPT_VERSION || (brief.model_used === BRIEF_FALLBACK_MODEL && isGeminiConfigured)) &&
    dueForKick(briefKicks.get(business.id), now, BRIEF_KICK_WINDOW_MS)
  ) {
    briefKicks.set(business.id, now);
    after(async () => {
      try {
        await repo.upsertBusinessBrief(await generateBusinessBrief(business, await repo.listServices(business.id)));
      } catch (err) {
        console.warn("[picks] brief refresh failed (non-fatal):", (err as Error).message);
      }
    });
  }

  if (rows.length > 0) {
    // A fresh signup's first pick lands alone; the rest of the week follows
    // in about a minute. Say so above the list and ask for it, rather than
    // showing one row as if that were the week.
    let writingMore = 0;
    if (businessJustOnboarded(business.created_at)) {
      const [count, opportunities] = await Promise.all([
        repo.countWeekPicks(business.id, week),
        repo.listOpportunities(business.id, week),
      ]);
      const expected = eligibleWeekOpportunities(opportunities).length;
      if (count === 1 && expected > 1) {
        writingMore = expected - 1;
        await kickWeekJob(business.id, { now: requestTime() });
      }
    }
    return (
      <div className="page picks">
        <AlertBar alerts={unreadAlerts} />
        <div className="page-head">
          <div>
            <h1>This week</h1>
            <p className="context">{weekRange}</p>
          </div>
        </div>
        {writingMore > 0 && (
          <p className="wk-more" role="status">
            <span className="wk-progress__mark is-live" aria-hidden="true" />
            Your first pick is ready. The other {writingMore} land in about a minute; this page refreshes itself.
            <AutoRefresh everyMs={6000} times={30} />
          </p>
        )}
        <ol className="picks-list" aria-label={`Picks for ${weekRange}, ranked`}>
          {rows.map(({ pick, run }) => (
            <li key={pick.id}>
              <ListRow pick={pick} run={run} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const where = isOnlineBusiness(business) ? "across the US" : `around ${business.city}`;

  // One wait from signup to the first pick. Every step is read from the
  // database, the finished ones say what they found, and the ranked terms
  // show with their grades while the picks are still being written. The
  // job is asked for whatever the week still needs. No alerts here: an
  // owner with no picks yet has nothing to be alerted about.
  const progress = await weekProgress(repo, business, { scanAllowed: isSupabaseConfigured });
  if (progress.stage !== "done") {
    const briefInFlight = !brief && briefLikelyInFlight(business.created_at);
    if (!briefInFlight) await kickWeekJob(business.id, { now });
    const current = progress.steps.find((s) => s.state === "current");
    const { analysis, found } = progress;
    const firstPickMin = Math.max(1, Math.ceil(progress.remainingSec / 60));
    return (
      <div className="page picks">
        <AutoRefresh everyMs={6000} times={100} />
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>{current?.label ?? "Getting your first picks ready"}</h1>
            <p className="context">
              Your first pick lands in about {firstPickMin} minute{firstPickMin === 1 ? "" : "s"}, the rest of the week
              a minute after. TRND reads your customers, your category and your competitors before it grades anything,
              and what it finds shows up here as it lands
              {isEmailConfigured ? ". You get one email when the picks are written" : ""}.
            </p>
          </div>
        </div>
        <div className="wk">
          <section className="panel wk-main" aria-label="What TRND has found so far">
            {analysis ? (
              <div className="wk-analysis">
                <p className="mono-label">Your analysis</p>
                <p className="wk-analysis__positioning">{analysis.positioning}</p>
                {analysis.who && (
                  <p className="wk-analysis__who">
                    <b>Who buys:</b> {analysis.who}
                  </p>
                )}
                {analysis.watchTerms.length > 0 && (
                  <ul className="wk-chips" aria-label="Terms being watched">
                    {analysis.watchTerms.map((t) => (
                      <li key={t}>{sentenceCase(t)}</li>
                    ))}
                  </ul>
                )}
                {brief && (
                  <Link className="wk-analysis__link" href="/app/snapshot">
                    Read the full analysis
                  </Link>
                )}
              </div>
            ) : (
              <div className="wk-analysis is-pending" aria-busy="true">
                <p className="mono-label">Your analysis</p>
                <div className="skeleton h-[14px] w-[90%]" />
                <div className="skeleton h-[14px] w-[76%]" />
                <div className="skeleton h-[14px] w-[58%]" />
              </div>
            )}

            {found.terms.length > 0 && (
              <div className="wk-found">
                <p className="mono-label">Rising right now</p>
                <ul className="wk-found__list">
                  {found.terms.map((t) => (
                    <li key={t.term}>
                      <span className="wk-found__term">{sentenceCase(t.term)}</span>
                      <span className="wk-found__delta">↑{t.deltaPct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {found.rivals.length > 0 && (
              <div className="wk-found">
                <p className="mono-label">Competitors being read</p>
                <ul className="wk-found__list">
                  {found.rivals.map((r) => (
                    <li key={r.name}>
                      <span className="wk-found__term">{sentenceCase(r.name)}</span>
                      {r.ads !== null && (
                        <span className="wk-found__meta">
                          {r.ads} active ad{r.ads === 1 ? "" : "s"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {progress.ranked.length > 0 && (
              <div className="wk-ranked">
                <p className="mono-label">This week&apos;s opportunities, being written up</p>
                <ul className="wk-ranked__list">
                  {progress.ranked.map((r) => (
                    <li key={r.term}>
                      <span className="wk-ranked__term">{sentenceCase(r.term)}</span>
                      {r.grade && <span className="picks-grade is-amber">{r.grade}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="panel wk-side" aria-label="Progress">
            <WeekClock startedAt={business.created_at} remainingSec={progress.remainingSec} />
            <ol className="wk-progress">
              {progress.steps.map((step) => (
                <li key={step.key} className={`wk-progress__row is-${step.state}`}>
                  <span className="wk-progress__mark" aria-hidden="true" />
                  <span className="wk-progress__text">
                    <span className="wk-progress__label">
                      {step.label}
                      {step.state === "current" && (
                        <span className="wk-progress__typical"> · usually about {step.typicalSec}s</span>
                      )}
                    </span>
                    {step.detail && <span className="wk-progress__detail">{step.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="page picks">
      <AlertBar alerts={unreadAlerts} />
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">This week · {weekRange}</span>
          <h1>No picks this week</h1>
          <p className="context">
            This week&apos;s reads for <b>{sentenceCase(business.category)}</b> {where} did not turn up a pick worth
            spending on.
          </p>
        </div>
      </div>
      <div className="panel max-w-[620px]">
        <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
          The daily read keeps going. New picks land on Monday.
        </p>
        <div className="flex gap-3 flex-wrap mt-[18px]">
          <Link className="btn btn-ghost btn-sm" href="/app/report">
            Weekly report
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/app/snapshot">
            Your analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
