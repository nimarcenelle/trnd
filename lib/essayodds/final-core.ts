import type { ListReview } from "./lists-core";
import type { Review } from "./review-core";

/**
 * Final Read: is each piece ready to submit? Worked out here from the saved reviews, never by a model, so the same
 * drafts always get the same verdict. Ready means the score clears the bar and nothing is over its limit.
 */
export const READY_ESSAY = 75;
export const READY_ENTRY = 60;
export const MIN_WORDS = 50;

export type Verdict = { status: "ready" | "pass" | "over" | "empty"; reason: string };

export function essayVerdict(words: number, review: Review | null): Verdict {
  if (words < MIN_WORDS) return { status: "empty", reason: words ? `${words} words so far. Reviews start at ${MIN_WORDS}.` : "Not written yet." };
  if (!review) return { status: "pass", reason: "Not reviewed yet." };
  if (review.words > review.limit) return { status: "over", reason: `${review.words - review.limit} words over the ${review.limit}-word limit.` };
  if (review.score >= READY_ESSAY) return { status: "ready", reason: `Scores ${review.score}.` };
  const top = review.notes[0];
  return { status: "pass", reason: `Scores ${review.score}. ${top ? top.fix : "Revise the weakest criterion and review again."}` };
}

export function listVerdict(pasted: boolean, review: ListReview | null): Verdict {
  if (!pasted) return { status: "empty", reason: "Nothing pasted yet." };
  if (!review || !review.entries.length) return { status: "pass", reason: "Not reviewed yet." };
  const weak = review.entries.filter((e) => e.score < READY_ENTRY);
  if (!weak.length) return { status: "ready", reason: `All ${review.entries.length} entries score ${READY_ENTRY} or more.` };
  const worst = review.weakest === null ? weak[0] : review.entries[review.weakest];
  return { status: "pass", reason: `${weak.length} of ${review.entries.length} below ${READY_ENTRY}. Start with ${worst.name}: ${worst.fix}` };
}

export const ready = (verdicts: Verdict[]) => verdicts.filter((v) => v.status === "ready").length;
