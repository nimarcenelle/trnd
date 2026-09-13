import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { runIntelIngest } from "@/lib/intel/ingest";

/**
 * The daily intel read on its own clock: every brand's own accounts, its
 * direct rivals' accounts and their ads, inside one invocation's budget.
 * The market read (/api/cron/ingest) used to run this after itself, in
 * whatever time was left, which for a dozen brands was none.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const intel = await runIntelIngest(getAdminRepo(), { budgetMs: 270_000 });
  return NextResponse.json({ businesses: intel.length, intel });
}

export const GET = POST;
