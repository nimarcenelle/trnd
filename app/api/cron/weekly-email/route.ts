import { NextResponse, type NextRequest } from "next/server";

import { createReportReadyAlert, evaluateAlerts } from "@/lib/alerts/engine";
import { getAdminRepo } from "@/lib/db/admin";
import { renderWeeklyReportEmail, weeklyReportSubject } from "@/lib/email/weekly-report";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { buildIntelReport } from "@/lib/report/build";
import { generateIntelNote } from "@/lib/report/note";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/**
 * Monday morning, after the recommend cron: write each business's analyst
 * note, raise the report-ready alert, and send the weekly email. The email
 * is the retention artifact — the report arrives, the owner doesn't fetch it.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repo = getAdminRepo();
  const week = weekOf();
  const sent: { businessId: string; emailed: boolean }[] = [];

  for (const business of await repo.listAllBusinesses()) {
    try {
      if ((await repo.listOpportunities(business.id, week)).length === 0) {
        await recommendForBusiness(repo, business);
      }
      const report = await buildIntelReport(repo, business);
      const note = await repo
        .getIntelNote(business.id, week)
        .then(async (n) => n ?? repo.upsertIntelNote(await generateIntelNote(business, report)));
      await evaluateAlerts(repo, business);
      await createReportReadyAlert(repo, business);
      const alerts = await repo.listAlerts(business.id, { unreadOnly: true, limit: 6 });

      const owner = await repo.getProfile(business.owner_id);
      let emailed = false;
      if (owner?.email) {
        const res = await sendEmail({
          to: owner.email,
          subject: weeklyReportSubject(business, note),
          html: renderWeeklyReportEmail({ business, note, report, alerts }),
        });
        emailed = res.ok && !res.skipped;
      }
      sent.push({ businessId: business.id, emailed });
    } catch (err) {
      console.warn(`[weekly-email] business ${business.id} failed:`, (err as Error).message);
      sent.push({ businessId: business.id, emailed: false });
    }
  }
  return NextResponse.json({ week, sent });
}
