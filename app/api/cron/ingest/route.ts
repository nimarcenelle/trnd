import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { runIntelIngest } from "@/lib/intel/ingest";
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
  const summary = await runIngest(repo);
  const intel = await runIntelIngest(repo);
  return NextResponse.json({ ...summary, intel });
}
