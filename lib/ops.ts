import type { Creator } from "@/lib/db/types";
import { isScanning } from "@/lib/format";

/**
 * What the daily cron reports about itself: reads that are failing or stuck,
 * so a problem (Apify out of credit, an OpenAI quota, a broken deploy) reaches
 * us by email the same morning instead of from a user.
 */

type Row = Pick<Creator, "id" | "handle" | "scan_status" | "scan_started_at" | "scan_error" | "scan_failures" | "last_scan_at">;

export interface OpsSummary {
  creators: number;
  due: number;
  started: number;
  failing: { handle: string; failures: number; error: string }[];
  stuck: string[];
  /** Accounts not read in over two days that aren't failing or locked: the cron itself may be broken. */
  stale: string[];
}

export function opsSummary(rows: Row[], due: number, started: number, locked: (id: string) => boolean, now = Date.now()): OpsSummary {
  const failing = rows
    .filter((c) => c.scan_status === "error")
    .map((c) => ({ handle: c.handle, failures: c.scan_failures ?? 0, error: c.scan_error ?? "" }))
    .sort((a, b) => b.failures - a.failures);
  const stuck = rows.filter((c) => c.scan_status === "running" && !isScanning(c, now)).map((c) => c.handle);
  const stale = rows
    .filter((c) => c.scan_status !== "error" && !locked(c.id) && c.last_scan_at && now - Date.parse(c.last_scan_at) > 48 * 3_600_000)
    .map((c) => c.handle);
  return { creators: rows.length, due, started, failing, stuck, stale };
}

/** Worth an email: anything failing or stuck, or scans that were due but didn't start. */
export const needsAttention = (s: OpsSummary) => s.failing.length > 0 || s.stuck.length > 0 || s.stale.length > 0 || s.started < s.due;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function opsEmailHtml(s: OpsSummary): string {
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p>None.</p>");
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;color:#17131b">
<h2 style="margin:0 0 8px">TRND for creators: today's read needs a look</h2>
<p>${s.creators} accounts · ${s.due} due · ${s.started} started</p>
<h3>Failing (${s.failing.length})</h3>${list(s.failing.map((f) => `@${f.handle} · ${f.failures} in a row · ${f.error}`))}
<h3>Stuck mid-read (${s.stuck.length})</h3>${list(s.stuck.map((h) => `@${h}`))}
<h3>Not read in 2+ days (${s.stale.length})</h3>${list(s.stale.map((h) => `@${h}`))}
<p style="color:#8f879a;font-size:12px">The raw errors are in the Vercel function logs under [scan].</p>
</div>`;
}
