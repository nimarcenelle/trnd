import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { checkWatches } from "@/lib/watch/check";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/**
 * Daily: every watched test from the free read, checked against its
 * brand's live ads, and the email each one calls for (lib/watch/check.ts).
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await checkWatches(getAdminRepo());
  return NextResponse.json(result);
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
