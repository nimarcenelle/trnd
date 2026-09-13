import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AnalysisProgress from "@/components/app/analysis-progress";
// The waiting states below have nothing on them to keep, and the whole page
// changes when the picks land, so they poll the page itself.
import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
import ListRow from "@/components/picks/list-row";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Alert } from "@/lib/db/types";
import { isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { nextWeekStage } from "@/lib/picks/advance-week";
import { kickWeekJob } from "@/lib/picks/kick";
import { dueForKick, weekRangeLabel } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { titleCase } from "@/lib/text";

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
        {alerts.length > 1 && ` and ${alerts.length - 1} other${alerts.length === 2 ? "" : "s"}`}
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
    return (
      <div className="page picks">
        <AlertBar alerts={unreadAlerts} />
        <div className="page-head">
          <div>
            <h1>This week</h1>
            <p className="context">{weekRange}</p>
          </div>
        </div>
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

  // Brand-new business, analysis still being written. The picks are judged
  // against it, so nothing is written before it lands. Onboarding writes
  // it; if that died, the week job writes it again.
  if (!brief && isGeminiConfigured) {
    if (!briefLikelyInFlight(business.created_at)) kickWeekJob(business.id, { now });
    return (
      <div className="page picks">
        <AutoRefresh everyMs={8000} times={60} />
        <AlertBar alerts={unreadAlerts} />
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>Reading your business</h1>
            <p className="context">
              Your analysis is being written. Your first picks follow it, usually within a few minutes. This page
              refreshes itself.
            </p>
          </div>
        </div>
        <div className="panel max-w-[620px]">
          <AnalysisProgress startedAt={business.created_at} />
          <Link className="btn btn-ghost btn-sm mt-[18px]" href="/app/snapshot">
            View the analysis
          </Link>
        </div>
      </div>
    );
  }

  // What the week still needs, read from the database: nothing in memory
  // decides whether an owner sees "writing" or "no picks". A stage left to
  // run means the week is still being written, and the job is asked for it.
  const stage = await nextWeekStage(repo, business, { scanAllowed: isSupabaseConfigured });
  if (stage !== "done") {
    kickWeekJob(business.id, { now });
    return (
      <div className="page picks">
        <AutoRefresh everyMs={8000} times={60} />
        <AlertBar alerts={unreadAlerts} />
        <div className="page-head">
          <div>
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>Writing this week&apos;s picks</h1>
            <p className="context">
              Reading demand for <b>{business.category}</b> {where}, then writing picks against what you sell.
            </p>
          </div>
        </div>
        <div className="panel max-w-[620px]">
          <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
            This takes a few minutes. The page refreshes itself.
          </p>
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
            This week&apos;s reads for <b>{titleCase(business.category)}</b> {where} did not turn up a pick worth
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
