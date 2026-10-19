import { planState } from "@/lib/billing";
import { SCAN_STALE_MS, scanCreator } from "@/lib/creators/scan";
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

  const { data } = await adminSupabase().from("creators").select("*");
  const due = ((data ?? []) as Creator[]).filter((c) => {
    if (planState(c).locked) return false;
    const live = c.scan_status === "running" && c.scan_started_at && Date.now() - Date.parse(c.scan_started_at) < SCAN_STALE_MS;
    return !live && (!c.last_scan_at || Date.now() - Date.parse(c.last_scan_at) > DUE_AFTER_MS);
  });
  const results = await Promise.allSettled(
    due.map((c) =>
      fetch(`${url.origin}${url.pathname}?creator=${c.id}&resume=1`, { headers: { authorization: `Bearer ${env.cronSecret}` } }).then((r) => r.status),
    ),
  );
  return Response.json({ due: due.length, ok: results.filter((r) => r.status === "fulfilled" && r.value === 200).length });
}
