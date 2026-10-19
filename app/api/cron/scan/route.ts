import { planState } from "@/lib/billing";
import { SCAN_STALE_MS, scanCreator } from "@/lib/creators/scan";
import { allRows } from "@/lib/db/rows";
import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { env } from "@/lib/env";

/**
 * The daily read. Called by Vercel Cron with no creator: lists every creator
 * that is due and calls itself once per creator, so each scan gets its own
 * function and its own time limit. Called with ?creator=<id>: scans that one
 * (&resume=1: carries on a scan another function handed off).
 */
export const maxDuration = 300;

/** A creator scanned in the last 20 hours is not due again yet. */
const DUE_AFTER_MS = 20 * 3_600_000;
/** Scans started per second, so a large list doesn't start every Apify run at once. */
const PER_SECOND = 5;

type Due = Pick<Creator, "id" | "plan" | "plan_status" | "trial_ends_at" | "scan_status" | "scan_started_at" | "last_scan_at">;

export async function GET(req: Request): Promise<Response> {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const creatorId = url.searchParams.get("creator");
  if (creatorId) {
    try {
      return Response.json(await scanCreator(creatorId, { resume: url.searchParams.get("resume") === "1" }));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const sb = adminSupabase();
  const creators = await allRows<Due>((from, to) => sb.from("creators").select("id, plan, plan_status, trial_ends_at, scan_status, scan_started_at, last_scan_at").order("id").range(from, to));
  const due = creators.filter((c) => {
    if (planState(c).locked) return false;
    const live = c.scan_status === "running" && c.scan_started_at && Date.now() - Date.parse(c.scan_started_at) < SCAN_STALE_MS;
    return !live && (!c.last_scan_at || Date.now() - Date.parse(c.last_scan_at) > DUE_AFTER_MS);
  });
  // Each scan runs in its own invocation; this one only starts them, a few a second, and does not wait for them to finish.
  let started = 0;
  for (let i = 0; i < due.length; i += PER_SECOND) {
    const batch = due.slice(i, i + PER_SECOND);
    const sent = await Promise.all(
      batch.map((c) =>
        fetch(`${url.origin}${url.pathname}?creator=${c.id}&resume=1`, { headers: { authorization: `Bearer ${env.cronSecret}` }, signal: AbortSignal.timeout(1000) })
          .then(() => true)
          .catch((e: Error) => e.name === "TimeoutError"),
      ),
    );
    started += sent.filter(Boolean).length;
  }
  return Response.json({ due: due.length, started });
}
