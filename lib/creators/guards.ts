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
