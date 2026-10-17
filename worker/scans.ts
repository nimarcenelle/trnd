import { AiBudgetExceeded } from "../lib/ai/openai";
import { adminSupabase } from "../lib/db/supabase";
import { env } from "../lib/env";
import { captureError } from "../lib/errors";
import { alertIfDegraded } from "../lib/ops";
import { scanBrand } from "../lib/scan";

/**
 * The scan queue's runner. Every few seconds it claims queued scans
 * (claim_scan_job: one at a time, skipping ones another worker holds, and
 * reclaiming ones a crashed worker left running), runs up to WORKER_SCANS at
 * once, and retries a failed scan twice, 10 then 20 minutes later. When the
 * day's queue is empty it checks the fleet's data health and alerts.
 */

const POLL_MS = 10_000;
const MAX = Math.max(1, Number(process.env.WORKER_SCANS) || 2);
const MAX_ATTEMPTS = 3;

interface Job {
  id: string;
  brand_id: string;
  force_report: boolean;
  attempts: number;
}

/** Long enough that a scan on the worker never hands a stage off to the app. */
const WORKER_BUDGET_MS = 45 * 60_000;

export const scanStats = { claimed: 0, done: 0, failed: 0, running: 0, lastJobAt: null as string | null };
let processedSinceAlert = 0;
let lastAlertAt = 0;

async function run(job: Job) {
  const sb = adminSupabase();
  scanStats.running++;
  scanStats.lastJobAt = new Date().toISOString();
  try {
    // No serverless time limit here: the whole scan runs in this process, never handed off.
    const result = await scanBrand(job.brand_id, { forceReport: job.force_report, budgetMs: WORKER_BUDGET_MS });
    await sb.from("scan_jobs").update({ status: "done", result, error: null, finished_at: new Date().toISOString() }).eq("id", job.id);
    scanStats.done++;
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    const retry = !(err instanceof AiBudgetExceeded) && job.attempts < MAX_ATTEMPTS;
    await sb
      .from("scan_jobs")
      .update(
        retry
          ? { status: "queued", error: message, run_after: new Date(Date.now() + job.attempts * 10 * 60_000).toISOString() }
          : { status: err instanceof AiBudgetExceeded ? "done" : "failed", error: message, finished_at: new Date().toISOString() },
      )
      .eq("id", job.id);
    if (!retry) scanStats.failed++;
    await captureError(err, { where: "worker-scan", brandId: job.brand_id, attempt: String(job.attempts) });
  } finally {
    scanStats.running--;
    processedSinceAlert++;
  }
}

async function tick() {
  const sb = adminSupabase();
  while (scanStats.running < MAX) {
    const { data, error } = await sb.rpc("claim_scan_job", { stale_minutes: 60 });
    if (error) {
      console.warn("[scans] claim failed:", error.message);
      return;
    }
    const job = (data as Job[] | null)?.[0];
    if (!job) break;
    scanStats.claimed++;
    void run(job);
  }
  // The day's work is done: check the fleet once, and alert if it's short.
  if (scanStats.running === 0 && processedSinceAlert > 0 && Date.now() - lastAlertAt > 20 * 3_600_000) {
    const { count } = await sb.from("scan_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
    if (!count) {
      processedSinceAlert = 0;
      lastAlertAt = Date.now();
      await alertIfDegraded(sb).catch((err) => captureError(err, { where: "worker-alert" }));
    }
  }
}

/** Start the loop when the queue is on and the worker has the app's database credentials. */
export function startScanLoop(): boolean {
  if (!env.scanQueue) return false;
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    console.warn("[scans] SCAN_QUEUE is on but Supabase credentials are missing: not running scans");
    return false;
  }
  const loop = () =>
    tick()
      .catch((err) => captureError(err, { where: "worker-tick" }))
      .finally(() => setTimeout(loop, POLL_MS));
  void loop();
  console.log(`[scans] running scans off the queue, ${MAX} at a time`);
  return true;
}
