import { bearerMatches } from "@/lib/auth/bearer";
import { planState, trialReminderDue } from "@/lib/billing";
import { isDue } from "@/lib/creators/guards";
import { fetchSelf, scanCreator, selfUrl } from "@/lib/creators/scan";
import { allRows } from "@/lib/db/rows";
import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { sendEmail, sendTrialEndingNoCardEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { needsAttention, opsEmailHtml, opsSummary } from "@/lib/ops";

/**
 * The daily read. Called by Vercel Cron with no creator: lists every creator
 * that is due and calls itself once per creator, so each scan gets its own
 * function and its own time limit. Called with ?creator=<id>: scans that one
 * (&resume=1: carries on a scan another function handed off; &budget=<ms>
 * shortens this invocation's time budget, so a stage hand-off can be
 * exercised on demand).
 */
export const maxDuration = 300;

/** Scans started per second, so a large list doesn't start every Apify run at once. */
const PER_SECOND = 5;

type Due = Pick<Creator, "id" | "owner_id" | "plan" | "plan_status" | "trial_ends_at" | "trial_used_at" | "trial_reminder_for" | "scan_status" | "scan_started_at" | "last_scan_at" | "scan_failures" | "handle" | "scan_error">;

export async function GET(req: Request): Promise<Response> {
  if (!bearerMatches(req.headers.get("authorization"), env.cronSecret)) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const creatorId = url.searchParams.get("creator");
  if (creatorId) {
    try {
      const budget = Number(url.searchParams.get("budget"));
      return Response.json(await scanCreator(creatorId, { resume: url.searchParams.get("resume") === "1", budgetMs: budget > 0 ? budget : undefined }));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const sb = adminSupabase();
  const creators = await allRows<Due>((from, to) => sb.from("creators").select("id, owner_id, handle, plan, plan_status, trial_ends_at, trial_used_at, trial_reminder_for, scan_status, scan_started_at, scan_error, last_scan_at, scan_failures").order("id").range(from, to));
  // Not locked, not mid-read, and 20 hours since the last read (longer for an account that keeps failing).
  const due = creators.filter((c) => !planState(c).locked && isDue(c));
  // Each scan runs in its own invocation; this one only starts them, a few a second, and does not wait for them to finish.
  let started = 0;
  for (let i = 0; i < due.length; i += PER_SECOND) {
    const batch = due.slice(i, i + PER_SECOND);
    const sent = await Promise.all(
      batch.map((c) =>
        // To the site's own domain, not the address this request came in on: Vercel Cron calls the
        // deployment's *.vercel.app URL, which Vercel's login wall sends to a sign-in page.
        fetchSelf(`${selfUrl()}/api/cron/scan?creator=${c.id}&resume=1`, 1000)
          .then((res) => {
            if (!res.ok) console.warn(`[cron] scan for ${c.id} refused: ${res.status}`);
            return res.ok;
          })
          .catch((e: Error) => e.name === "TimeoutError"),
      ),
    );
    started += sent.filter(Boolean).length;
  }
  // No-card trials ending within two days get their reminder, once per end date (card trials get Stripe's).
  for (const c of creators.filter((x) => trialReminderDue(x))) {
    try {
      await sendTrialEndingNoCardEmail(sb, c as Creator, new Date(c.trial_ends_at));
      await sb.from("creators").update({ trial_reminder_for: c.trial_ends_at }).eq("id", c.id);
    } catch (e) {
      console.warn(`[cron] trial reminder for ${c.id}:`, (e as Error).message);
    }
  }

  const summary = opsSummary(creators, due.length, started, (id) => planState(creators.find((c) => c.id === id)!).locked);
  if (needsAttention(summary)) {
    console.warn("[cron] needs attention:", JSON.stringify(summary));
    await sendEmail(env.alertEmail, `TRND for creators: ${summary.failing.length} failing, ${summary.stuck.length} stuck, ${summary.started}/${summary.due} started`, opsEmailHtml(summary)).catch((e) =>
      console.warn("[cron] alert email:", (e as Error).message),
    );
  }
  return Response.json({ due: due.length, started });
}
