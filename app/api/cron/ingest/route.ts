import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { runIngest } from "@/lib/signals/ingest";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/** Daily signal ingestion + per-business intel (reviews, competitor reads,
 * alerts). Idempotent per day (DB-level dedupe). */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repo = getAdminRepo();
  // Intel (own accounts, rivals, ads) runs in its own cron with its own
  // budget (/api/cron/intel): a dozen brands' paid reads never fit in what
  // the market read leaves of this one.
  const summary = await runIngest(repo);
  // YouTube API data is kept 30 days at most. A failure here must not sink
  // the day's ingest, so it reports instead of throwing.
  let retention: { signalsScrubbed: number; seriesDeleted: number } | { error: string };
  try {
    retention = await repo.expireYoutubeData(30);
  } catch (err) {
    retention = { error: (err as Error).message };
  }
  return NextResponse.json({ ...summary, retention });
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
