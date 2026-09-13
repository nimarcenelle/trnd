import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { runPicksJob } from "@/lib/picks/week-job";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/**
 * Writes this week's picks for every brand that has a ranking and no picks
 * yet, as many as one invocation's budget allows. When brands remain, it
 * calls itself once more and stops listening: the next invocation carries on
 * with its own 300 seconds. Each hop writes at least one brand, so the chain
 * always ends.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runPicksJob(getAdminRepo());
  let handedOff = false;
  if (result.remaining > 0 && result.written.length > 0) {
    handedOff = true;
    try {
      // The host that served this request: the configured url may redirect
      // to another host, and a redirect drops the authorization header.
      await fetch(new URL("/api/cron/picks", request.nextUrl.origin), {
        method: "POST",
        headers: { authorization: `Bearer ${env.cronSecret}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      /* the timeout is the point: the next invocation keeps running */
    }
  }
  return NextResponse.json({ ...result, handedOff });
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
