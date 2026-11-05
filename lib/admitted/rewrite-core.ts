import { createHash } from "node:crypto";

import { wordCount } from "./review-core";

/** Pure rules for essay rewrites: the saved-result key, how much of the draft survived, what must be fixed. */
export const REWRITE_VERSION = "4";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** A detail the student added in answer to a review's fix. It counts as their own material, like the draft. */
export type Answer = { ask: string; answer: string };

export function parseAnswers(raw: unknown): Answer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: { ask?: unknown; answer?: unknown } | null) => ({ ask: String(a?.ask ?? "").trim().slice(0, 300), answer: String(a?.answer ?? "").trim().slice(0, 1500) }))
    .filter((a) => a.answer)
    .slice(0, 6);
}

export const answersText = (answers: Answer[]) => answers.map((a) => `${a.ask}\n${a.answer}`).join("\n\n");

export function rewriteKey(draft: string, prompt: string, limit: number, revision: number, answers: Answer[] = []): string {
  return "rewrite:" + createHash("sha256").update([REWRITE_VERSION, clean(draft), clean(prompt), String(limit), String(revision), clean(answersText(answers))].join("|")).digest("hex");
}

const sentences = (text: string) => (clean(text).match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter(Boolean);

/** The share of the rewrite's sentences that appear word for word in the draft. Counted, never asked of the model. */
export function keptShare(draft: string, rewrite: string): number {
  const from = new Set(sentences(draft));
  const to = sentences(rewrite);
  if (!to.length) return 0;
  return Math.round((to.filter((s) => from.has(s)).length / to.length) * 100);
}

/** A rewrite may tighten a draft, not gut it. */
const MIN_LENGTH_SHARE = 0.7;

export function rewriteProblems(rewrite: string, draftWords: number, limit: number, flagged: string[]): string[] {
  const words = wordCount(rewrite);
  const floor = Math.round(Math.min(draftWords, limit) * MIN_LENGTH_SHARE);
  return [
    ...flagged.map((line) => `Not in the draft or the student's details: ${line}`),
    ...(words > limit ? [`${words} words is over the ${limit} word limit.`] : []),
    ...(words < floor ? [`${words} words is too short. Keep at least ${floor} words of the student's material.`] : []),
  ];
}

/** One finished attempt at a rewrite: its score, and any lines the checker says are not in the draft. */
export type Attempt = { after: number; flagged: string[] };

/** An attempt with no invented lines beats one with them, then the higher score wins. A tie keeps the first. */
export function bestAttempt<T extends Attempt>(attempts: T[]): T {
  return attempts.reduce((best, a) => {
    const clean = !a.flagged.length;
    const bestClean = !best.flagged.length;
    if (clean !== bestClean) return clean ? a : best;
    return a.after > best.after ? a : best;
  });
}
