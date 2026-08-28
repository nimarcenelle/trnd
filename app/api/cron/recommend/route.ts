import { NextResponse, type NextRequest } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { runRecommend } from "@/lib/recommend/recommend";

export const maxDuration = 300;

/** Weekly opportunity generation for every business. Idempotent per week. */
export async function POST(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runRecommend(getAdminRepo());
  return NextResponse.json({ businesses: results.length, results });
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
