import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { apifyIsDown } from "@/lib/apify";
import type { Rival } from "@/lib/db/types";
import { sendEmail } from "@/lib/email";
import { env, isWorkerConfigured } from "@/lib/env";

/**
 * The health of the whole fleet, for whoever runs TRND: the share of watched
 * companies whose ads were read in the last day (the number to keep above
 * 95%), why the rest failed, and whether the scraper worker is up. The daily
 * cron emails OPS_EMAIL when the share drops below the target.
 */

export const TARGET = 0.95;

export interface FleetHealth {
  companies: number;
  readLastDay: number;
  share: number | null;
  failing: { reason: string; count: number }[];
  worker: { configured: boolean; up: boolean | null; stats?: Record<string, unknown> };
  apifyPaused: boolean;
  /** Scan jobs waiting over an hour past their time: the worker isn't taking them. */
  stuckJobs: number;
}

export async function fleetHealth(sb: SupabaseClient): Promise<FleetHealth> {
  const { data } = await sb.from("rivals").select("page_id, last_error, last_scraped_at, health").eq("is_self", false).not("page_id", "is", null);
  const rows = (data ?? []) as Pick<Rival, "page_id" | "last_error" | "last_scraped_at" | "health">[];
  const dayAgo = Date.now() - 26 * 3_600_000;
  const fresh = (r: (typeof rows)[number]) => {
    const at = r.health?.ads?.ok ? r.health.ads.at : r.health?.ads ? null : r.last_scraped_at;
    return Boolean(at && Date.parse(at) > dayAgo);
  };
  const readLastDay = rows.filter(fresh).length;
  const reasons = new Map<string, number>();
  for (const r of rows.filter((x) => !fresh(x))) {
    const reason = (r.health?.ads?.note ?? r.last_error ?? "not read in the last day").replace(/\d{6,}/g, "…").slice(0, 120);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  let worker: FleetHealth["worker"] = { configured: isWorkerConfigured, up: null };
  if (isWorkerConfigured) {
    const res = await fetch(`${env.scraperUrl}/health`, { signal: AbortSignal.timeout(8_000), cache: "no-store" }).catch(() => null);
    worker = { configured: true, up: Boolean(res?.ok), stats: res?.ok ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : undefined };
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: stuck } = await sb.from("scan_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lt("run_after", hourAgo);

  return {
    stuckJobs: stuck ?? 0,
    companies: rows.length,
    readLastDay,
    share: rows.length ? Math.round((readLastDay / rows.length) * 1000) / 1000 : null,
    failing: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    worker,
    apifyPaused: apifyIsDown(),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Email OPS_EMAIL when the fleet reads fewer than 95% of companies in a day, or the worker is down. */
export async function alertIfDegraded(sb: SupabaseClient): Promise<FleetHealth> {
  const h = await fleetHealth(sb);
  const degraded = (h.share !== null && h.share < TARGET) || h.worker.up === false || h.stuckJobs > 0;
  if (degraded && env.opsEmail) {
    const pct = h.share === null ? "n/a" : `${Math.round(h.share * 100)}%`;
    const html = `<div style="font-family:Inter,system-ui,sans-serif;color:#111110">
<p><b>${pct}</b> of ${h.companies} watched companies had their ads read in the last day (target ${TARGET * 100}%).</p>
<p>Scraper worker: ${h.worker.configured ? (h.worker.up ? "up" : "<b>down</b>") : "not configured"}${h.apifyPaused ? " · Apify paused (billing or token)" : ""}</p>
${h.stuckJobs ? `<p><b>${h.stuckJobs} scans have waited over an hour in the queue:</b> the worker isn't taking them. Check it on Railway, or turn SCAN_QUEUE off on Vercel to scan there.</p>` : ""}
<ul>${h.failing.map((f) => `<li>${f.count} × ${esc(f.reason)}</li>`).join("")}</ul></div>`;
    await sendEmail(env.opsEmail, `TRND data: ${pct} read in the last day`, html).catch((err) => console.warn("[ops] alert:", (err as Error).message));
  }
  return h;
}
