import { createHash } from "node:crypto";

import { wordCount } from "./review-core";

/** Pure rules for essay rewrites: the saved-result key, how much of the draft survived, what must be fixed. */
export const REWRITE_VERSION = "3";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function rewriteKey(draft: string, prompt: string, limit: number, revision: number): string {
  return "rewrite:" + createHash("sha256").update([REWRITE_VERSION, clean(draft), clean(prompt), String(limit), String(revision)].join("|")).digest("hex");
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
    ...flagged.map((line) => `Not in the draft: ${line}`),
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
