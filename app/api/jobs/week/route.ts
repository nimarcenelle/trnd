import { NextResponse, type NextRequest, after } from "next/server";

import { getAdminRepo } from "@/lib/db/admin";
import { env, isSupabaseConfigured } from "@/lib/env";
import { nextWeekStage, runWeekStage, WEEK_STAGES, type WeekStage } from "@/lib/picks/advance-week";
import { requestWeekJob } from "@/lib/picks/kick";

/**
 * One stage of one brand's week, then a hand-off to itself for the next.
 * The page and onboarding ask for this instead of running the chain inside
 * their own request, where the platform's time limit cut it short (see
 * lib/picks/advance-week.ts). Idempotent: every call reads what the week
 * still needs and does only that.
 *
 * A hand-off names the stage the last one said comes next, and this route
 * honors it. It used to re-derive every stage from the database alone, and
 * three things the database cannot say were silently dropped: "the deep
 * read finished, grade the week again", "this scan was cut short, resume
 * it", and "the rivals are read, now rank". A hint is only ever a stage
 * that is safe to repeat, so a stale one from a hop that died costs a
 * repeated stage, never a wrong week. A kick with no hint derives as before.
 */
export const maxDuration = 300;

/** Brief, scan, rivals, rank, picks, deepen resuming a few times, rank and picks again, a check: more hops is a loop. */
const MAX_HOPS = 16;

function stageHint(raw: string | null): WeekStage | null {
  return raw && (WEEK_STAGES as string[]).includes(raw) && raw !== "done" ? (raw as WeekStage) : null;
}

export async function POST(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const businessId = request.nextUrl.searchParams.get("business") ?? "";
  const hop = Number(request.nextUrl.searchParams.get("hop") ?? "0") || 0;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return NextResponse.json({ error: "business required" }, { status: 400 });

  const repo = getAdminRepo();
  const business = await repo.getBusiness(businessId);
  if (!business) return NextResponse.json({ error: "no such business" }, { status: 404 });

  const hint = stageHint(request.nextUrl.searchParams.get("stage"));
  const stage = hint ?? (await nextWeekStage(repo, business, { scanAllowed: isSupabaseConfigured }));
  if (stage === "done") return NextResponse.json({ businessId, ran: null, next: "done", hop });
  const next = await runWeekStage(repo, business, stage);
  let handedOff = false;
  if (next !== "done" && hop + 1 < MAX_HOPS) {
    handedOff = true;
    // Sent after the response: a request fired on the way out was frozen
    // with the function and never left, so a week stalled between stages
    // until the next visit asked again.
    const origin = request.nextUrl.origin;
    after(() => requestWeekJob(businessId, hop + 1, origin, next));
  }
  return NextResponse.json({ businessId, ran: stage, hinted: hint !== null, next, hop, handedOff });
}

export const GET = POST;
