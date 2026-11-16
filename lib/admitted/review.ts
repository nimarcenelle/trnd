import "server-only";

import { generateJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { buildReview, DEFAULT_WORD_LIMIT, quickKey, REVIEW_READS, REVIEW_SYSTEM, ReviewReply, reviewKey, reviewPrompt, type Review } from "./review-core";
import { countToday, readSaved, saveFirst } from "./saved";

export class EssayCapReached extends Error {}

/** The same essay, prompt and word limit always return the saved review. */
export async function reviewEssay(essay: string, prompt: string, limit: number): Promise<Review> {
  const key = reviewKey(essay, prompt, limit);
  const hit = (await readSaved<Review>([key])).get(key);
  if (hit) return hit;
  if ((await countToday("review")) >= env.rewriteDailyCap) throw new EssayCapReached();
  const reads = await Promise.allSettled(Array.from({ length: REVIEW_READS }, () => generateJson({ model: env.openaiModelWriting, effort: "high", system: REVIEW_SYSTEM, prompt: reviewPrompt(essay, prompt, limit), schema: ReviewReply })));
  const replies = reads.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  // One read alone would bring back the swings, so nothing is saved from it.
  if (replies.length < 2) throw new Error("Essay review: too few reads came back");
  const value = buildReview(essay, limit, replies);
  return (await saveFirst("review", [{ key, value }])).get(key) ?? value;
}

/**
 * A quick read for the odds flow: one pass on the fast model, so the odds don't wait a minute for three reads.
 * Its score is labeled a quick read; the full review behind it is the one the workspace shows.
 */
export async function quickRead(essay: string): Promise<Review> {
  const key = quickKey(essay);
  const hit = (await readSaved<Review>([key])).get(key);
  if (hit) return hit;
  if ((await countToday("quick")) >= env.rewriteDailyCap * 3) throw new EssayCapReached();
  const reply = await generateJson({ model: env.openaiModelFast, effort: "low", system: REVIEW_SYSTEM, prompt: reviewPrompt(essay, "", DEFAULT_WORD_LIMIT), schema: ReviewReply });
  const value = buildReview(essay, DEFAULT_WORD_LIMIT, [reply]);
  return (await saveFirst("quick", [{ key, value }])).get(key) ?? value;
}
