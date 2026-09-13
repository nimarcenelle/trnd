import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AnalysisProgress from "@/components/app/analysis-progress";
// The waiting states below have nothing on them to keep, and the whole page
// changes when the picks land, so they poll the page itself.
import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
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
import { getAdminRepo } from "@/lib/db/admin";
import type { Alert, Business } from "@/lib/db/types";
import { isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { dueForKick, generationDecision, weekRangeLabel, type GenerationEntry } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";
import { isOnlineBusiness } from "@/lib/signals/geo";
import { titleCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

/*
 * Per-process memory of the background kicks this page makes. The repo can
 * list a week's ready picks but not its drafts, so "this week holds no picks
 * at all" cannot be read back. Without this, a week the job wrote only drafts
 * for would regenerate on every silent refresh. A second instance may kick
 * once more; the weekly job replaces the week either way, so that costs a
 * run, never a loop.
 */
const generation = new Map<string, GenerationEntry>();
const briefKicks = new Map<string, number>();
const BRIEF_KICK_WINDOW_MS = 15 * 60_000;

// The kick guards compare against wall time. Read once per request, outside
// the render body, so the component itself stays pure.
function requestTime(): number {
  return Date.now();
}

// The list page never calls a model on the request path. Everything that
// writes (the analysis, the market read, the picks) runs here, after the
// response, on the service repo: ranking and picks write tables RLS keeps
// read-only for user sessions.
function kickWeekPicks(business: Business, week: string, opts: { scanFirst: boolean; healBrief: boolean }) {
  const key = `${business.id}:${week}`;
  generation.set(key, { state: "running", at: Date.now() });
  after(async () => {
    const jobRepo = getAdminRepo();
    try {
      if (opts.healBrief) {
        // The onboarding write died somewhere. Picks are judged against the
        // analysis, so it comes first.
        await jobRepo.upsertBusinessBrief(
          await generateBusinessBrief(business, await jobRepo.listServices(business.id)),
        );
      }
      if (opts.scanFirst) {
        // A fresh signup whose onboarding scan hiccuped: read the market
        // before writing picks about it.
        const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
        await runSignalIngestForBusiness(jobRepo, business);
      }
      if (opts.healBrief || opts.scanFirst) {
        const { rerankWeek } = await import("@/lib/recommend/rerank");
        await rerankWeek(jobRepo, business);
      } else if ((await jobRepo.listOpportunities(business.id, week)).length === 0) {
        // First visit of the week before the cron: pull the market reads and
        // rank them so the picks have something to be written from.
        try {
          const { ensureIntelFresh } = await import("@/lib/intel/ingest");
          await ensureIntelFresh(jobRepo, business);
        } catch (err) {
          console.warn("[picks] first-visit intel refresh failed (non-fatal):", (err as Error).message);
        }
        const { recommendForBusiness } = await import("@/lib/recommend/recommend");
        await recommendForBusiness(jobRepo, business);
      }
      const { generateWeekPicks } = await import("@/lib/picks/generate");
      const result = await generateWeekPicks(jobRepo, business);
      generation.set(key, { state: "done", at: Date.now(), ready: result.ready });
    } catch (err) {
      generation.set(key, { state: "done", at: Date.now(), ready: 0 });
      console.warn("[picks] week generation failed (non-fatal):", (err as Error).message);
    }
  });
}

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
  const key = `${business.id}:${week}`;

  // Brand-new business, analysis still being written. The picks are judged
  // against it, so nothing is written before it lands.
  if (!brief && isGeminiConfigured) {
    const inFlight = briefLikelyInFlight(business.created_at);
    if (!inFlight && generationDecision(generation.get(key), now) === "kick") {
      kickWeekPicks(business, week, { scanFirst: false, healBrief: true });
    }
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

  // Analysis done, this week's picks not written yet. Kick once, then wait.
  const decision = brief ? generationDecision(generation.get(key), now) : "settled";
  if (decision === "kick" && brief) {
    // Only a freshly onboarded business with no reads today gets a market
    // scan first: that is the signup whose own scan hiccuped, and the guard
    // keeps a quiet market from buying a paid scan on every visit.
    const scanFirst =
      isSupabaseConfigured &&
      businessJustOnboarded(business.created_at) &&
      (await repo.listSignalsForCategory(business.category, { sinceDays: 1 })).length === 0;
    kickWeekPicks(business, week, { scanFirst, healBrief: false });
  }
  if (decision !== "settled") {
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
