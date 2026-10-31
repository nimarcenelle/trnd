import { planState } from "@/lib/billing";
import type { Creator } from "@/lib/db/types";
import { isScanning } from "@/lib/format";

/**
 * When the setup actions may start a read. Each read is Apify runs and model
 * calls, so a form posted again (or by a script) must not start one the
 * product didn't mean to give: "Read again now" has its own 10-minute gap and
 * the billing lock, and these keep setup from being a way around them.
 */

type Scan = Pick<Creator, "scan_status" | "scan_started_at" | "last_scan_at">;
type Billing = Pick<Creator, "plan" | "plan_status" | "trial_ends_at" | "trial_used_at">;

/** A locked account switches handles at most this often: each switch is a new account's free first read. */
export const SWITCH_GAP_MS = 24 * 3_600_000;

/** Setup's "Try again" (and the handle box on the same handle) picks up only a read that failed, stalled or never finished. */
export function canRetry(c: Scan, now = Date.now()): boolean {
  if (isScanning(c, now)) return false;
  return c.scan_status === "error" || c.scan_status === "running" || !c.last_scan_at;
}

/** Whether a locked account must wait before pointing at a new handle. */
export function switchBlocked(c: Scan & Billing, now = Date.now()): boolean {
  return planState(c, now).locked && Boolean(c.last_scan_at) && now - Date.parse(c.last_scan_at!) < SWITCH_GAP_MS;
}

/** "Read again now" writes a new plan at most this often: each one is a full read and a model call. */
export const MANUAL_PLAN_GAP_MS = 24 * 3_600_000;

/** Whether "Read again now" must wait: a plan was written less than a day ago. */
export function manualPlanBlocked(lastPlanAt: string | null | undefined, now = Date.now()): boolean {
  return Boolean(lastPlanAt) && now - Date.parse(lastPlanAt!) < MANUAL_PLAN_GAP_MS;
}

/** The daily read's normal gap. */
export const DUE_AFTER_MS = 20 * 3_600_000;
/** The longest a failing account waits between tries. */
export const MAX_BACKOFF_MS = 7 * 24 * 3_600_000;

/**
 * When the daily read tries an account again. Normally 20 hours after the last
 * read; after failures in a row, 20 hours doubled per extra failure, up to a
 * week, so a deleted or private handle stops costing a read every day.
 */
export function dueAfterMs(failures: number): number {
  if (failures <= 1) return DUE_AFTER_MS;
  return Math.min(MAX_BACKOFF_MS, DUE_AFTER_MS * 2 ** (failures - 1));
}

type Due = Scan & Pick<Creator, "scan_failures">;

/** Whether the daily read should start this account now (the billing lock is checked separately). */
export function isDue(c: Due, now = Date.now()): boolean {
  if (isScanning(c, now)) return false;
  const failures = c.scan_failures ?? 0;
  // After a failure, the clock runs from the try that failed, not the last read that finished.
  const last = failures > 0 ? (c.scan_started_at ?? c.last_scan_at) : c.last_scan_at;
  return !last || now - Date.parse(last) > dueAfterMs(failures);
}

/** A failed read resumes at the stage it stopped on while that read is this fresh; older, it starts over. */
export const RESUME_WITHIN_MS = 6 * 3_600_000;

/**
 * What a read that failed tells the creator. Our own messages pass through; a
 * provider's raw error (an Apify status, an OpenAI quota line, a database error)
 * is logged, never shown.
 */
export function friendlyScanError(message: string): string {
  const ours = ["TikTok didn't answer", "We couldn't read @", "The plan came back without ideas", "Plans aren't set up", "TikTok reads are not set up"];
  if (ours.some((p) => message.startsWith(p))) return message;
  if (/^Apify .*(402|403)\b/.test(message) || /usage|credit|limit/i.test(message) && message.startsWith("Apify")) {
    return "Our TikTok reader is paused on our side. Nothing is lost: your read picks up as soon as it's back.";
  }
  if (message.startsWith("Apify") || /timeout|aborted|fetch failed/i.test(message)) return "TikTok didn't answer this time. Nothing is lost: try again in a few minutes.";
  if (/openai|model|quota|rate limit|429/i.test(message)) return "Writing your plan failed on our side. Nothing is lost: the next read tries again.";
  return "Something went wrong on our side. Nothing is lost: the next read tries again.";
}
