import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { CreativeBrief } from "@/lib/db/types";

import type { ConceptView } from "./concept-view";

/**
 * The brief in the shapes a creative team already passes around: Markdown
 * for Notion, Slack and a doc, Word for the agency. Same order as the
 * plain-text copy: what we are testing and why, then what to make, then
 * the facts, then how to judge it, then the evidence with its limits.
 */

export type BriefExportView = Pick<
  ConceptView,
  "title" | "situation" | "hypothesis" | "format" | "hooks" | "script" | "shotList" | "approvedFacts" | "guardrail" | "unknowns" | "differsFrom" | "evaluation" | "outcomes" | "evidence" | "researchTerm"
> & { lineage?: CreativeBrief["lineage"] | null; trackingName?: string; opening?: CreativeBrief["opening"] | null };

interface Section {
  heading: string;
  lines: string[];
  /** Lines that are a list rather than paragraphs. */
  list?: boolean;
  ordered?: boolean;
}

/** The brief as sections, so every format renders the same content. */
export function briefSections(view: BriefExportView): Section[] {
  const beats = view.opening?.beats ?? [];
  const sections: Section[] = [
    { heading: "The customer situation", lines: [view.situation] },
    { heading: "The hypothesis (what we think may work, and why)", lines: [view.hypothesis] },
  ];
  if (view.lineage) sections.push({ heading: "Your own record on this shape", lines: [view.lineage.line, "Click-through only, from your ad history. Not purchase data."] });
  sections.push({ heading: "Hook", lines: [view.hooks.primary] });
  if (view.hooks.alternatives.length) sections.push({ heading: "Other openings for the same concept", lines: view.hooks.alternatives, list: true });
  if (beats.length) {
    sections.push({
      heading: "The first three seconds (shoot these as written)",
      lines: beats.map((b) => `See: ${b.visual}${b.on_screen_text ? ` | On screen: ${b.on_screen_text}` : ""}${b.vo ? ` | Say: ${b.vo}` : ""}`),
      list: true,
      ordered: true,
    });
  }
  sections.push({
    heading: "Direction",
    lines: [`Show: ${view.script.direction.show}`, `Say: ${view.script.direction.say}`, `Prove: ${view.script.direction.prove}`, `Close: ${view.script.cta}`, `Length: about ${view.script.duration_seconds}s`],
  });
  sections.push({ heading: "Shot list", lines: view.shotList, list: true, ordered: true });
  sections.push({ heading: "Approved facts (use these and nothing else)", lines: view.approvedFacts, list: true });
  if (view.guardrail) sections.push({ heading: "Guardrail", lines: [view.guardrail] });
  sections.push({ heading: "How this differs from recent creative", lines: [view.differsFrom] });
  sections.push({ heading: "What is uncertain", lines: view.unknowns, list: true });
  const judge = [view.evaluation.comparison, `Budget: ${view.evaluation.budget}`];
  if (view.trackingName) judge.push(`Name the ad: ${view.trackingName} (its results find this test by that name)`);
  sections.push({ heading: "How to judge the test", lines: judge });
  if (view.evaluation.watch.length) sections.push({ heading: "Watch", lines: view.evaluation.watch, list: true });
  if (view.evaluation.caveats.length) sections.push({ heading: "Caveats", lines: view.evaluation.caveats, list: true });
  if (view.evaluation.missing.length) sections.push({ heading: "Missing before this can say more", lines: view.evaluation.missing, list: true });
  sections.push({
    heading: "What we learn",
    lines: [`If it does better: ${view.outcomes.if_better}`, `If it does the same: ${view.outcomes.if_same}`, `If it does worse: ${view.outcomes.if_worse}`],
  });
  const evidence = view.evidence.flatMap((g) => [
    `${g.label}:`,
    ...g.rows.flatMap((r) => [`- ${r.claim}${r.sourceLabel ? ` (${r.sourceLabel}${r.observedOn ? `, ${r.observedOn}` : ""})` : ""}`, ...(r.limitation ? [`  Limit: ${r.limitation}`] : [])]),
  ]);
  if (evidence.length) sections.push({ heading: `Evidence (research input: "${view.researchTerm}")`, lines: evidence });
  return sections;
}

/** Markdown: a heading per section, lists as lists, the rest as paragraphs. */
export function conceptToMarkdown(view: BriefExportView): string {
  const out: string[] = [`# ${view.title}`, "", `Format: ${view.format}`, ""];
  for (const s of briefSections(view)) {
    out.push(`## ${s.heading}`, "");
    if (s.list) out.push(...s.lines.map((l, i) => (s.ordered ? `${i + 1}. ${l}` : `- ${l}`)));
    else out.push(...s.lines.flatMap((l) => [l, ""]));
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Word: the same sections as headings, lists and paragraphs. */
export async function conceptToDocx(view: BriefExportView): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: view.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Format: ${view.format}`, italics: true })] }),
  ];
  for (const s of briefSections(view)) {
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }));
    for (const line of s.lines) {
      children.push(
        s.list
          ? new Paragraph({ text: line, numbering: s.ordered ? { reference: "ordered", level: 0 } : undefined, bullet: s.ordered ? undefined : { level: 0 } })
          : new Paragraph({ text: line, alignment: AlignmentType.LEFT }),
      );
    }
  }
  const doc = new Document({
    creator: "TRND",
    title: view.title,
    numbering: { config: [{ reference: "ordered", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
