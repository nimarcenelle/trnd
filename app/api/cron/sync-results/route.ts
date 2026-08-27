import { NextResponse, type NextRequest } from "next/server";

import { runResultsSync } from "@/lib/ads/sync";
import { getAdminRepo } from "@/lib/db/admin";
import { env, isMetaAdsConfigured } from "@/lib/env";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/** Daily pull of platform insights for every launched campaign — the closed
 * loop. No-ops loudly when the Meta app isn't configured. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isMetaAdsConfigured) {
    return NextResponse.json({ skipped: "META_APP_ID / META_APP_SECRET not configured" });
  }
  return NextResponse.json({ synced: await runResultsSync(getAdminRepo()) });
}
