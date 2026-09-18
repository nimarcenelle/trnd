import { NextResponse, type NextRequest } from "next/server";

import { runMetaHistorySync } from "@/lib/ads/history-sync";
import { syncRunsFromHistory } from "@/lib/ads/run-sync";
import { getAdminRepo } from "@/lib/db/admin";
import { env, isMetaAdsConfigured } from "@/lib/env";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/**
 * Daily: every connected account's own ad history is pulled (when the Meta
 * app is configured), then every brand's open creative tests are filled
 * from whatever its history now carries under their names, synced or
 * uploaded. The second half runs whether or not Meta is configured: an
 * export the owner uploaded is history too.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repo = getAdminRepo();
  const history = isMetaAdsConfigured ? await runMetaHistorySync(repo) : { skipped: "META_APP_ID / META_APP_SECRET not configured" };
  const runs: { businessId: string; synced: number }[] = [];
  try {
    for (const business of await repo.listAllBusinesses()) {
      const synced = await syncRunsFromHistory(repo, business.id);
      if (synced.length > 0) runs.push({ businessId: business.id, synced: synced.length });
    }
  } catch (err) {
    console.warn("[sync-results] runs from history failed:", (err as Error).message);
  }
  return NextResponse.json({ history, runs });
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
