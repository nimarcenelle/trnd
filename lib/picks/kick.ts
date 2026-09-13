import { after } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env, isSupabaseConfigured } from "@/lib/env";

import { nextWeekStage, runWeekStage } from "./advance-week";

/**
 * Ask for a brand's week to be advanced. In production that is one short
 * request to /api/jobs/week, which runs a stage inside its own time budget
 * and hands off to itself for the next; the caller never waits. Without a
 * cron secret (local, demo) the stages run in this process after the
 * response, one after another.
 *
 * Rate-limited per process: a page that refreshes itself every eight
 * seconds must not ask eight times a minute. The job is idempotent, so a
 * second instance asking too costs a duplicate stage at worst, never a
 * wrong week.
 */

const KICK_WINDOW_MS = 2 * 60_000;
/** Stages one inline run may chain: brief, scan, intel, rank, picks, and a check. */
const MAX_INLINE_STAGES = 6;
const kicks = new Map<string, number>();

export function jobUrl(businessId: string, hop = 0): URL {
  const url = new URL("/api/jobs/week", env.appUrl);
  url.searchParams.set("business", businessId);
  if (hop > 0) url.searchParams.set("hop", String(hop));
  return url;
}

/** Fire the job route and do not wait for it. Errors are swallowed: the
 * next visit asks again. */
export function requestWeekJob(businessId: string, hop = 0): void {
  fetch(jobUrl(businessId, hop), {
    method: "POST",
    headers: { authorization: `Bearer ${env.cronSecret}` },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    /* the route runs on regardless of whether this wait ends first */
  });
}

export function kickWeekJob(businessId: string, opts: { now?: number } = {}): boolean {
  const now = opts.now ?? Date.now();
  const last = kicks.get(businessId);
  if (last !== undefined && now - last < KICK_WINDOW_MS) return false;
  kicks.set(businessId, now);

  if (env.cronSecret && isSupabaseConfigured) {
    after(() => requestWeekJob(businessId));
    return true;
  }
  after(async () => {
    const repo = getAdminRepo();
    const business = await repo.getBusiness(businessId);
    if (!business) return;
    let stage = await nextWeekStage(repo, business, { scanAllowed: isSupabaseConfigured });
    for (let i = 0; i < MAX_INLINE_STAGES && stage !== "done"; i += 1) {
      stage = await runWeekStage(repo, business, stage);
    }
  });
  return true;
}
