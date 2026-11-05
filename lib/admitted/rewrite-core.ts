import { createHash } from "node:crypto";

/** Pure rules for essay rewrites: the saved-result key and how much of the draft survived. */
export const REWRITE_VERSION = "1";
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function rewriteKey(draft: string, prompt: string, revision: number): string {
  return "rewrite:" + createHash("sha256").update([REWRITE_VERSION, clean(draft), clean(prompt), String(revision)].join("|")).digest("hex");
}

const sentences = (text: string) => (clean(text).match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter(Boolean);

/** The share of the rewrite's sentences that appear word for word in the draft. Counted, never asked of the model. */
export function keptShare(draft: string, rewrite: string): number {
  const from = new Set(sentences(draft));
  const to = sentences(rewrite);
  if (!to.length) return 0;
  return Math.round((to.filter((s) => from.has(s)).length / to.length) * 100);
}
