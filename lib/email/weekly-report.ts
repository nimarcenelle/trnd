import type { Alert, Business, IntelNote, StandingQuestion } from "@/lib/db/types";
import { env } from "@/lib/env";
import type { IntelReport, RankedRow } from "@/lib/report/build";
import { sentenceCase } from "@/lib/text";

import { FAINT, FONT, INK, LINE, MONO, SOFT, esc, eyebrow, mono, paragraph, renderEmail } from "./layout";

/**
 * The Monday email: the note's headline, its actions, the ranked picks and
 * anything that changed since last week, on the shared layout, linking into
 * the app for the full cited report. The email is the retention artifact,
 * so it reads complete on its own.
 */

export function weeklyReportSubject(business: Business, note: IntelNote): string {
  return `${business.name} — this week: ${note.headline.replace(/\.$/, "")}`;
}

/** "↑ 47%" / "↓ 12%" / "→ 0%", or an em dash when no delta landed. */
function deltaLabel(deltaPct: number | null): string {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return "—";
  const glyph = deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→";
  return `${glyph} ${Math.abs(Math.round(deltaPct))}%`;
}

function rankedTable(rows: RankedRow[]): string {
  const cells = rows
    .map((r, i) => {
      const border = i === 0 ? "" : `border-top:1px solid ${LINE};`;
      return `
      <tr>
        <td style="${border}padding:10px 12px 10px 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${INK};">
          <span style="font-family:${MONO};font-size:12px;color:${FAINT};margin-right:8px;">${r.rank}</span>${esc(sentenceCase(r.term))}
        </td>
        <td align="right" style="${border}padding:10px 0;white-space:nowrap;">
          ${mono(r.grade.letter)}<span style="display:inline-block;width:12px;"></span>${mono(deltaLabel(r.deltaPct), SOFT)}
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${cells}</table>`;
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
  const ranked = report.ranked.slice(0, 5);

  const actions = note.actions
    .slice(0, 4)
    .map((a, i) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};"><span style="font-family:${MONO};font-size:12px;color:${FAINT};margin-right:8px;">${i + 1}</span>${esc(a)}</p>`)
    .join("");

  const alertLines = alerts
    .slice(0, 4)
    .map((a) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${SOFT};"><span style="color:${INK};font-weight:600;">${esc(a.title)}</span> — ${esc(a.body)}</p>`)
    .join("");

  const standingBlocks = standing
    .map(
      (q) =>
        `<p style="margin:12px 0 4px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${INK};">${esc(q.question)}</p>` +
        (q.changed ? paragraph(q.changed, INK) : "") +
        q.answer.map((p) => paragraph(p)).join(""),
    )
    .join("");

  const body = [
    actions ? eyebrow("This week", { first: true }) + actions : "",
    ranked.length > 0 ? eyebrow("Ranked picks") + rankedTable(ranked) : "",
    alertLines ? eyebrow("Since last week") + alertLines : "",
    standingBlocks ? eyebrow("Your standing questions") + standingBlocks : "",
    note.narrative.length > 0 ? eyebrow("Why") + note.narrative.map((p) => paragraph(p)).join("") : "",
  ].join("");

  const intro =
    ranked.length > 0
      ? `The week of ${report.week} for ${sentenceCase(business.name)}: ${ranked.length === 1 ? "one pick" : `${ranked.length} picks`}, ranked, with every number traced to a dated read.`
      : `The week of ${report.week} for ${sentenceCase(business.name)}, with every number traced to a dated read.`;

  return renderEmail({
    preheader: note.actions[0] ?? note.headline,
    title: sentenceCase(note.headline),
    intro,
    body,
    cta: { label: "Open this week's report", url },
    footnote: null,
  });
}
