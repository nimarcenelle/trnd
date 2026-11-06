import { runCheck } from "@/lib/creator/check";
import { sendRecheck } from "@/lib/creator/email";
import { dueLeads, markSent } from "@/lib/creator/store";
import { env, isEmailConfigured } from "@/lib/env";

/**
 * The weekly re-check. Daily, Vercel Cron hits this; every creator whose week
 * is up gets their posts read again and the result emailed. A handful per run
 * keeps the run inside its time limit; the rest wait for tomorrow.
 */
export const maxDuration = 300;

const PER_RUN = 12;
const PARALLEL = 3;

export async function GET(req: Request): Promise<Response> {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!env.apifyToken || !isEmailConfigured) return Response.json({ skipped: "needs APIFY_TOKEN and RESEND_API_KEY" });
  const leads = await dueLeads(PER_RUN);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < leads.length; i += PARALLEL) {
    await Promise.all(
      leads.slice(i, i + PARALLEL).map(async (lead) => {
        try {
          const c = await runCheck(lead.handle, lead.platform, lead.niche ?? "");
          if (c.error || !c.stats) throw new Error(c.error ?? "no stats");
          await sendRecheck(lead.email, c, lead.token);
          await markSent(lead.id, true);
          sent++;
        } catch (e) {
          console.warn(`[creators] re-check @${lead.handle}:`, (e as Error).message);
          await markSent(lead.id, false);
          failed++;
        }
      }),
    );
  }
  return Response.json({ due: leads.length, sent, failed });
}
