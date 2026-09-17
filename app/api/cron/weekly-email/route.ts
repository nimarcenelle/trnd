import { NextResponse, type NextRequest } from "next/server";

import { createWeekReadyAlert, evaluateAlerts } from "@/lib/alerts/engine";
import { getAdminRepo } from "@/lib/db/admin";
import { renderWeeklyBriefsEmail, weeklyBriefsSubject, type BriefLine, type OpenTestLine } from "@/lib/email/weekly-briefs";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { conceptRow } from "@/lib/picks/concept-view";
import { shortDate, weekRangeLabel } from "@/lib/picks/list";
import { weekOf } from "@/lib/recommend/week";
import { sentenceCase } from "@/lib/text";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

/**
 * Monday morning, after the picks cron: raise the week-ready alert and send
 * each brand its creative tests. A brand whose week holds no ready test gets
 * no email: an empty Monday mail is worse than none, and the picks job may
 * still be writing. Nothing here calls a model.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repo = getAdminRepo();
  const week = weekOf();
  const sent: { businessId: string; briefs: number; emailed: boolean }[] = [];

  for (const business of await repo.listAllBusinesses()) {
    try {
      const rows = await repo.listReadyPicks(business.id, week);
      const briefs: BriefLine[] = rows.flatMap(({ pick, run }) => {
        const row = conceptRow(pick, run);
        if (!row) return [];
        return [{ rank: row.rank, title: row.title, hypothesis: row.hypothesis, format: row.format, basis: row.basis.label, href: `${env.appUrl}${row.href}`, status: row.status }];
      });
      if (briefs.length === 0) {
        sent.push({ businessId: business.id, briefs: 0, emailed: false });
        continue;
      }
      await evaluateAlerts(repo, business);
      await createWeekReadyAlert(repo, business, briefs.length);

      const [runs, history] = await Promise.all([repo.listPickRuns(business.id).catch(() => []), repo.listAdHistory(business.id).catch(() => [])]);
      const openTests: OpenTestLine[] = runs
        .filter(({ run }) => run.status === "planned" || run.status === "running")
        .map(({ run, pick }) => ({
          title: pick.concept_title ?? sentenceCase(pick.term),
          status: run.status as "planned" | "running",
          since: shortDate(run.launched_at ?? run.started_at),
        }));

      const owner = await repo.getProfile(business.owner_id);
      let emailed = false;
      if (owner?.email) {
        const res = await sendEmail({
          to: owner.email,
          subject: weeklyBriefsSubject(business, briefs.length),
          html: renderWeeklyBriefsEmail({
            business,
            weekRange: weekRangeLabel(week),
            briefs,
            openTests,
            researchOnly: history.length === 0,
            url: `${env.appUrl}/app/picks`,
            resultsUrl: `${env.appUrl}/app/campaigns`,
          }),
        });
        emailed = res.ok && !res.skipped;
      }
      sent.push({ businessId: business.id, briefs: briefs.length, emailed });
    } catch (err) {
      console.warn(`[weekly-email] business ${business.id} failed:`, (err as Error).message);
      sent.push({ businessId: business.id, briefs: 0, emailed: false });
    }
  }
  return NextResponse.json({ week, sent });
}

// Vercel Cron invokes with GET (same Bearer CRON_SECRET header).
export const GET = POST;
