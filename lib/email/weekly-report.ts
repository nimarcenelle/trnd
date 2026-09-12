import type { Alert, Business, IntelNote, StandingQuestion } from "@/lib/db/types";
import { env } from "@/lib/env";
import type { IntelReport } from "@/lib/report/build";
import { titleCase } from "@/lib/text";

import { isOnlineBusiness } from "@/lib/signals/geo";
/**
 * The Monday email: analyst note + the ranking topline + unread alerts, all
 * inline-styled (email clients ignore stylesheets), linking into the app for
 * the full cited report. The email is the retention artifact — it must read
 * complete on its own.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const P = `margin:0 0 12px;font-size:14px;line-height:1.65;color:#5d564a;`;
const H = `font-family:Georgia,serif;color:#23201a;`;

export function weeklyReportSubject(business: Business, note: IntelNote): string {
  return `${business.name} — this week: ${note.headline.replace(/\.$/, "")}`;
}

export function renderWeeklyReportEmail(opts: {
  business: Business;
  note: IntelNote;
  report: IntelReport;
  alerts: Alert[];
  /** The owner's standing questions, freshly answered — the part of the
   * mail that is theirs by construction. */
  standing?: StandingQuestion[];
}): string {
  const { business, note, report, alerts } = opts;
  const standing = (opts.standing ?? []).filter((q) => q.answer.length > 0).slice(0, 5);
  const url = `${env.appUrl}/app/report`;

  const ranked = report.ranked
    .slice(0, 3)
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 10px 8px 0;font-size:13px;color:#6f6759;white-space:nowrap;">#${r.rank}</td>
        <td style="padding:8px 10px 8px 0;font-size:14px;color:#23201a;font-weight:600;">${esc(titleCase(r.term))}</td>
        <td style="padding:8px 0;font-size:13px;color:#8a6208;font-weight:700;text-align:right;">${r.grade.letter} · ${r.score.toFixed(1)}/10</td>
      </tr>`,
    )
    .join("");

  const alertRows = alerts
    .slice(0, 4)
    .map(
      (a) => `
      <tr><td style="padding:6px 0;font-size:13px;line-height:1.5;color:#5d564a;">• <b style="color:#23201a;">${esc(a.title)}</b> — ${esc(a.body)}</td></tr>`,
    )
    .join("");

  return `
<div style="background:#f6f4ee;padding:28px 16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="margin:0 0 18px;font-size:12px;letter-spacing:.18em;color:#6f6759;">● TRND — WEEKLY INTEL · ${esc(report.week)}</p>
    <div style="background:#ffffff;border:1px solid #e6e1d4;border-radius:14px;padding:26px 28px;">
      <p style="margin:0 0 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a6208;">This week</p>
      <h1 style="${H}margin:0 0 14px;font-size:22px;line-height:1.25;">${esc(note.headline)}</h1>
      ${note.actions.map((a, i) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#23201a;"><b style="color:#8a6208;">${i + 1}.</b> ${esc(a)}</p>`).join("")}
      <p style="margin:16px 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f6759;">Why</p>
      ${note.narrative.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}
    </div>

    <div style="background:#ffffff;border:1px solid #e6e1d4;border-radius:14px;padding:22px 28px;margin-top:14px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f6759;">This week's ranking</p>
      <table style="width:100%;border-collapse:collapse;">${ranked}</table>
    </div>

    ${
      alerts.length > 0
        ? `<div style="background:#ffffff;border:1px solid #e6e1d4;border-radius:14px;padding:22px 28px;margin-top:14px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f6759;">Since last week</p>
      <table style="width:100%;border-collapse:collapse;">${alertRows}</table>
    </div>`
        : ""
    }

    ${
      standing.length > 0
        ? `<div style="background:#ffffff;border:1px solid #e6e1d4;border-radius:14px;padding:22px 28px;margin-top:14px;">
      <p style="margin:0 0 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f6759;">Your standing questions</p>
      ${standing
        .map(
          (q) => `<p style="margin:12px 0 4px;font-size:14px;font-weight:600;color:#23201a;">${esc(q.question)}</p>${
            q.changed ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#8a6208;">${esc(q.changed)}</p>` : ""
          }${q.answer.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}`,
        )
        .join("")}
    </div>`
        : ""
    }

    <div style="text-align:center;margin:22px 0;">
      <a href="${url}" style="display:inline-block;background:#d99a12;color:#2b1b08;font-weight:600;font-size:14px;padding:12px 26px;border-radius:999px;text-decoration:none;">Open the full report →</a>
    </div>
    <p style="margin:0;text-align:center;font-size:11px;color:#6f6759;">Every number in the report is traceable to a dated source read.<br/>TRND${isOnlineBusiness(business) ? "" : ` · ${esc(business.city)}${business.region ? `, ${esc(business.region)}` : ""}`}</p>
  </div>
</div>`;
}
