import type { Business } from "@/lib/db/types";
import type { ConceptStatus } from "@/lib/picks/concept-view";
import { sentenceCase } from "@/lib/text";

import { FAINT, FONT, INK, LINE, MONO, SOFT, esc, eyebrow, mono, paragraph, renderEmail } from "./layout";

/**
 * The Monday email: this week's creative tests, each with its hypothesis
 * and format, the tests still in progress that want results, and the one
 * line on what this week could and could not check. It is the retention
 * artifact, so it reads complete on its own and links into the app for
 * the briefs themselves. It never carries a grade or a score.
 */

export interface BriefLine {
  rank: number;
  title: string;
  hypothesis: string;
  format: string;
  basis: string;
  href: string;
  status: ConceptStatus;
}

export interface OpenTestLine {
  title: string;
  status: "planned" | "running";
  /** "Sep 14" */
  since: string;
}

export function weeklyBriefsSubject(business: Business, count: number): string {
  const name = sentenceCase(business.name);
  return count === 1 ? `${name}: one creative test for this week` : `${name}: ${count} creative tests for this week`;
}

const STATUS_WORD: Partial<Record<ConceptStatus, string>> = { chosen: "In production", launched: "Launched", ended: "Ended", passed: "Passed" };

function briefBlock(b: BriefLine, i: number): string {
  const border = i === 0 ? "" : `border-top:1px solid ${LINE};padding-top:14px;`;
  const status = STATUS_WORD[b.status];
  return `
  <div style="${border}margin:${i === 0 ? "0" : "14px"} 0 0;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.35;color:${INK};"><span style="font-family:${MONO};font-size:12px;color:${FAINT};margin-right:8px;">${b.rank}</span><a href="${esc(b.href)}" style="color:${INK};text-decoration:none;">${esc(b.title)}</a>${status ? `<span style="font-family:${MONO};font-size:11.5px;color:${FAINT};margin-left:8px;">${esc(status)}</span>` : ""}</p>
    ${paragraph(b.hypothesis)}
    <p style="margin:0;">${mono(b.format, SOFT)}<span style="display:inline-block;width:10px;"></span>${mono(b.basis, FAINT)}</p>
  </div>`;
}

function openTestBlock(t: OpenTestLine): string {
  const word = t.status === "planned" ? `in production since ${t.since}` : `launched ${t.since}, no result recorded yet`;
  return `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${SOFT};"><span style="color:${INK};font-weight:600;">${esc(t.title)}</span> — ${esc(word)}</p>`;
}

export function renderWeeklyBriefsEmail(opts: {
  business: Business;
  /** "Sep 14 – Sep 20" */
  weekRange: string;
  briefs: BriefLine[];
  openTests: OpenTestLine[];
  /** True when no ad results are on file, so nothing was checked against them. */
  researchOnly: boolean;
  /** The week's page. */
  url: string;
  /** Where results are recorded. */
  resultsUrl: string;
}): string {
  const { business, weekRange, briefs, openTests, researchOnly, url, resultsUrl } = opts;
  const name = sentenceCase(business.name);
  const count = briefs.length;

  const body = [
    eyebrow(`This week · ${weekRange}`, { first: true }) + briefs.map(briefBlock).join(""),
    count > 0 && count < 3
      ? paragraph(`${count === 1 ? "Only one concept" : "Only two concepts"} cleared the bar this week. TRND shows fewer rather than fill the list with repeats or weak ideas.`, FAINT)
      : "",
    openTests.length > 0
      ? eyebrow("Tests in progress") +
        openTests.map(openTestBlock).join("") +
        `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${FAINT};">Record what a launched test did on <a href="${esc(resultsUrl)}" style="color:${FAINT};">Campaigns</a>. What you learned shapes next week's briefs.</p>`
      : "",
    researchOnly
      ? eyebrow("What this week could not check") +
        paragraph("No ad results are on file, so nothing here is checked against what has worked for you. Add an Ads Manager export in Settings and every brief is graded against your own ads of the same shape.", SOFT)
      : "",
  ].join("");

  const intro =
    count === 1
      ? `One creative test for ${name} this week: a hypothesis, the evidence behind it, and a brief a creator can shoot from.`
      : `${count} creative tests for ${name} this week, in priority order: each a hypothesis with the evidence behind it and a brief a creator can shoot from.`;

  return renderEmail({
    preheader: briefs[0] ? `${briefs[0].title}: ${briefs[0].hypothesis}` : intro,
    title: count === 1 ? "What to make next" : `What to make next: ${count} tests`,
    intro,
    body,
    cta: { label: "Open this week's briefs", url },
    footnote: "Briefs are hypotheses, not winners. Every fact in them traces to your catalog, your notes or a source you can open.",
  });
}
