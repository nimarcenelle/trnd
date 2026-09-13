import { headers } from "next/headers";
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

/**
 * The origin that served this request, for a call back into the app. The
 * configured app url is the fallback, never the first choice: the apex host
 * answers with a redirect to www, and a server-side fetch drops the
 * authorization header when it follows one to another host, so a kick sent
 * to the configured url landed as an unauthorized request and did nothing.
 */
export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return env.appUrl;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host.split(",")[0].trim()}`;
  } catch {
    return env.appUrl;
  }
}

export function jobUrl(businessId: string, hop = 0, origin: string = env.appUrl): URL {
  const url = new URL("/api/jobs/week", origin);
  url.searchParams.set("business", businessId);
  if (hop > 0) url.searchParams.set("hop", String(hop));
  return url;
}

/** Fire the job route and do not wait for it. Errors are swallowed: the
 * next visit asks again. */
export function requestWeekJob(businessId: string, hop = 0, origin?: string): void {
  fetch(jobUrl(businessId, hop, origin), {
    method: "POST",
    headers: { authorization: `Bearer ${env.cronSecret}` },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    /* the route runs on regardless of whether this wait ends first */
  });
}

export async function kickWeekJob(businessId: string, opts: { now?: number; origin?: string } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const last = kicks.get(businessId);
  if (last !== undefined && now - last < KICK_WINDOW_MS) return false;
  kicks.set(businessId, now);

  if (env.cronSecret && isSupabaseConfigured) {
    // Read while the request is still here; after() runs once it is gone.
    const origin = opts.origin ?? (await requestOrigin());
    after(() => requestWeekJob(businessId, 0, origin));
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
