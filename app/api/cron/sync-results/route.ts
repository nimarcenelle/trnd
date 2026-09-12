import { NextResponse, type NextRequest } from "next/server";

import { runMetaHistorySync } from "@/lib/ads/history-sync";
import { runResultsSync } from "@/lib/ads/sync";
import { getAdminRepo } from "@/lib/db/admin";
import { env, isMetaAdsConfigured } from "@/lib/env";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/** Daily pull of platform insights for every launched campaign — the closed
 * loop — then every connected account's own ad history, so the brand read
 * stays current without an export. No-ops loudly when the Meta app isn't
 * configured. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isMetaAdsConfigured) {
    return NextResponse.json({ skipped: "META_APP_ID / META_APP_SECRET not configured" });
  }
  const repo = getAdminRepo();
  // Results first: it marks expired tokens, which the history pull then skips.
  const synced = await runResultsSync(repo);
  const history = await runMetaHistorySync(repo);
  return NextResponse.json({ synced, history });
}
