import type { BrandPick, CreativeBrief, PickDetail, PickEvidence, PickRun, PickSignal } from "@/lib/db/types";

import { safeHref, SIGNAL_LABELS, SIGNAL_ORDER } from "./detail";

/**
 * The creative test page as data. Pure, so the rules that decide what a
 * brand sees are tested rather than eyeballed, and the page only maps them
 * to markup. Applies only to a pick that carries a brief; older keyword
 * picks keep the detail view they were written for.
 */

export type ConceptStatus = "proposed" | "chosen" | "launched" | "ended" | "passed";

/** One word on where the test is, and what that word does not mean. */
export const STATUS_LABEL: Record<ConceptStatus, { label: string; meaning: string; tone: "amber" | "mint" | "faint" | "red" | null }> = {
  proposed: { label: "Proposed", meaning: "A hypothesis on the table. Nothing has been made.", tone: null },
  chosen: { label: "In production", meaning: "Chosen for production. Not launched, not judged.", tone: "amber" },
  launched: { label: "Launched", meaning: "Live. No result is recorded yet, and launched is not successful.", tone: "mint" },
  ended: { label: "Ended", meaning: "Finished. Judged only by what was recorded.", tone: "faint" },
  passed: { label: "Passed", meaning: "You passed on this. That is a decision, not a performance result.", tone: "faint" },
};

export function conceptStatus(detail: Pick<PickDetail, "dismissed" | "run">): ConceptStatus {
  if (detail.dismissed) return "passed";
  const run = detail.run;
  if (!run) return "proposed";
  if (run.status === "planned") return "chosen";
  if (run.status === "running") return "launched";
  return "ended";
}

/** Whether the pick renders as a creative test. */
export function isConceptPick(pick: Pick<BrandPick, "brief" | "concept_title">): pick is BrandPick & { brief: CreativeBrief; concept_title: string } {
  return Boolean(pick.brief && typeof pick.brief === "object" && pick.concept_title);
}

export interface ConceptEvidenceRow {
  id: string;
  claim: string;
  kind: "observation" | "quote" | "measurement" | "context";
  href: string | null;
  sourceLabel: string | null;
  observedOn: string | null;
  sampleSize: number | null;
  limitation: string | null;
}

export interface ConceptEvidenceGroup {
  signal: PickSignal;
  label: string;
  rows: ConceptEvidenceRow[];
}

export interface ConceptView {
  id: string;
  title: string;
  rank: number;
  /** The research input the concept was found through. */
  researchTerm: string;
  status: ConceptStatus;
  basis: { kind: "builds_on" | "explores"; label: string };
  priorityReason: string | null;
  situation: string;
  hypothesis: string;
  unknowns: string[];
  differsFrom: string;
  format: string;
  hooks: { primary: string; alternatives: string[] };
  script: CreativeBrief["script"];
  shotList: string[];
  approvedFacts: string[];
  evaluation: CreativeBrief["evaluation"];
  outcomes: CreativeBrief["outcomes"];
  guardrail: string | null;
  evidence: ConceptEvidenceGroup[];
  /** How many evidence rows carry a limitation, for the "read the limits" line. */
  limitedRows: number;
  refinedFrom: { at: string; ask: string } | null;
  run: PickRun | null;
  copyAll: string;
}

const BASIS_LABEL = { builds_on: "Builds on a result", explores: "Explores new ground" } as const;

function day(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function linkLabel(href: string, label: string | null): string {
  const given = label?.trim();
  if (given) return given;
  return new URL(href).hostname.replace(/^www\./, "");
}

export function buildConceptEvidence(evidence: PickEvidence[]): ConceptEvidenceGroup[] {
  return SIGNAL_ORDER.flatMap((signal) => {
    const rows = evidence
      .filter((e) => e.signal === signal && e.claim.trim())
      .sort((a, b) => a.position - b.position)
      .map((e): ConceptEvidenceRow => {
        const href = safeHref(e.source_url);
        return {
          id: e.id,
          claim: e.claim.trim(),
          kind: e.kind ?? "observation",
          href,
          sourceLabel: href ? linkLabel(href, e.source_label) : (e.source_label ?? null),
          observedOn: e.observed_on ?? null,
          sampleSize: e.sample_size ?? null,
          limitation: e.limitation ?? null,
        };
      });
    return rows.length ? [{ signal, label: SIGNAL_LABELS[signal], rows }] : [];
  });
}

/** The brief as plain text, for the clipboard and the export: what a
 * creator needs, in the order they need it, with the evidence and its
 * limits at the end. */
export function conceptToText(view: Pick<ConceptView, "title" | "situation" | "hypothesis" | "format" | "hooks" | "script" | "shotList" | "approvedFacts" | "guardrail" | "unknowns" | "differsFrom" | "evaluation" | "outcomes" | "evidence" | "researchTerm">): string {
  const lines: string[] = [
    view.title.toUpperCase(),
    `Format: ${view.format}`,
    "",
    "THE CUSTOMER SITUATION",
    view.situation,
    "",
    "THE HYPOTHESIS (what we think may work, and why)",
    view.hypothesis,
    "",
    "HOOK",
    view.hooks.primary,
    ...(view.hooks.alternatives.length ? ["Alternatives:", ...view.hooks.alternatives.map((h) => `- ${h}`)] : []),
    "",
    "DIRECTION",
    `Show: ${view.script.direction.show}`,
    `Say: ${view.script.direction.say}`,
    `Prove: ${view.script.direction.prove}`,
    `Close: ${view.script.cta}`,
    `Length: about ${view.script.duration_seconds}s`,
    "",
    "SHOT LIST",
    ...view.shotList.map((s, i) => `${i + 1}. ${s}`),
    "",
    "APPROVED FACTS (use these and nothing else)",
    ...view.approvedFacts.map((f) => `- ${f}`),
    ...(view.guardrail ? ["", `GUARDRAIL: ${view.guardrail}`] : []),
    "",
    "HOW THIS DIFFERS FROM RECENT CREATIVE",
    view.differsFrom,
    "",
    "WHAT IS UNCERTAIN",
    ...view.unknowns.map((u) => `- ${u}`),
    "",
    "HOW TO JUDGE THE TEST",
    view.evaluation.comparison,
    `Budget: ${view.evaluation.budget}`,
    "Watch:",
    ...view.evaluation.watch.map((w) => `- ${w}`),
    ...(view.evaluation.caveats.length ? ["Caveats:", ...view.evaluation.caveats.map((c) => `- ${c}`)] : []),
    ...(view.evaluation.missing.length ? ["Missing before this can say more:", ...view.evaluation.missing.map((m) => `- ${m}`)] : []),
    "",
    "WHAT WE LEARN",
    `If it does better: ${view.outcomes.if_better}`,
    `If it does the same: ${view.outcomes.if_same}`,
    `If it does worse: ${view.outcomes.if_worse}`,
    "",
    `EVIDENCE (research input: "${view.researchTerm}")`,
    ...view.evidence.flatMap((g) => [
      `${g.label}:`,
      ...g.rows.flatMap((r) => [
        `- ${r.claim}${r.sourceLabel ? ` (${r.sourceLabel}${r.observedOn ? `, ${day(r.observedOn)}` : ""})` : ""}`,
        ...(r.limitation ? [`  Limit: ${r.limitation}`] : []),
      ]),
    ]),
  ];
  return lines.join("\n").trimEnd();
}

export function buildConceptView(detail: PickDetail): ConceptView | null {
  const { pick } = detail;
  if (!isConceptPick(pick)) return null;
  const brief = pick.brief;
  const evidence = buildConceptEvidence(detail.evidence);
  const basisKind = pick.basis ?? "explores";
  const partial = {
    title: pick.concept_title,
    situation: brief.situation,
    hypothesis: brief.hypothesis,
    format: brief.format,
    hooks: brief.hooks,
    script: brief.script,
    shotList: brief.shot_list,
    approvedFacts: brief.approved_facts,
    guardrail: pick.guardrail?.trim() || null,
    unknowns: brief.unknowns,
    differsFrom: brief.differs_from,
    evaluation: brief.evaluation,
    outcomes: brief.outcomes,
    evidence,
    researchTerm: pick.term,
  };
  return {
    id: pick.id,
    rank: pick.rank,
    status: conceptStatus(detail),
    basis: { kind: basisKind, label: BASIS_LABEL[basisKind] },
    priorityReason: pick.priority_reason?.trim() || null,
    limitedRows: detail.evidence.filter((e) => e.limitation).length,
    refinedFrom: brief.refined_from ? { at: brief.refined_from.at, ask: brief.refined_from.ask } : null,
    run: detail.run,
    copyAll: conceptToText(partial),
    ...partial,
  };
}

/** "trnd-brief-the-crust-on-the-showerhead.txt" */
export function conceptExportFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `trnd-brief-${slug || "export"}.txt`;
}

/** The compact row on the week's list. */
export interface ConceptRow {
  href: string;
  rank: number;
  title: string;
  hypothesis: string;
  format: string;
  basis: { kind: "builds_on" | "explores"; label: string };
  status: ConceptStatus;
}

export function conceptRow(pick: BrandPick, run: PickRun | null, dismissed = false): ConceptRow | null {
  if (!isConceptPick(pick)) return null;
  const basisKind = pick.basis ?? "explores";
  return {
    href: `/app/picks/${pick.id}`,
    rank: pick.rank,
    title: pick.concept_title,
    hypothesis: pick.brief.hypothesis,
    format: pick.brief.format,
    basis: { kind: basisKind, label: BASIS_LABEL[basisKind] },
    status: conceptStatus({ dismissed, run }),
  };
}
