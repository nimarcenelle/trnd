import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

/**
 * Scans as queued jobs, run by the worker (worker/scans.ts) with no time limit,
 * instead of inside a Vercel function that stops at 5 minutes. Turned on with
 * SCAN_QUEUE=1 once the worker runs with the app's environment. Without it, or
 * when queueing fails, callers scan in-process as before.
 */

export const scanQueueOn = () => env.scanQueue;

/** Queue a scan for the brand. True when it's queued (or one already was); false to scan in-process. */
export async function enqueueScan(brandId: string, opts: { kind: "daily" | "manual"; forceReport?: boolean }): Promise<boolean> {
  if (!scanQueueOn()) return false;
  const sb = adminSupabase();
  const { error } = await sb.from("scan_jobs").insert({ brand_id: brandId, kind: opts.kind, force_report: Boolean(opts.forceReport) });
  if (error && error.code !== "23505") {
    console.warn("[jobs] queueing failed, scanning in-process:", error.message);
    return false;
  }
  // Already queued: a manual scan still gets its report.
  if (error && opts.forceReport) await sb.from("scan_jobs").update({ force_report: true }).eq("brand_id", brandId).eq("status", "queued");
  await sb.from("brands").update({ scan_status: "running", scan_error: null, scan_started_at: new Date().toISOString() }).eq("id", brandId);
  return true;
}
