import "server-only";

import { generateJson, streamJson } from "@/lib/ai/openai";
import { env } from "@/lib/env";

import { buildReview, DEFAULT_WORD_LIMIT, quickKey, REVIEW_READS, REVIEW_SYSTEM, ReviewReply, reviewKey, reviewPrompt, type Review } from "./review-core";
import { parsePartial } from "./partial-json";
import { countToday, readSaved, saveFirst } from "./saved";
import { throttled, type LiveNote, type OnEvent } from "./stream-events";

export class EssayCapReached extends Error {}

/** The same essay, prompt and word limit always return the saved review. */
/** With `onEvent`, the first read's notes stream to the page as they are written; the score still waits for every read. */
export async function reviewEssay(essay: string, prompt: string, limit: number, onEvent?: OnEvent): Promise<Review> {
  const key = reviewKey(essay, prompt, limit);
  const hit = (await readSaved<Review>([key])).get(key);
  if (hit) return hit;
  if ((await countToday("review")) >= env.rewriteDailyCap) throw new EssayCapReached();
  const opts = { model: env.openaiModelWriting, effort: "high" as const, system: REVIEW_SYSTEM, prompt: reviewPrompt(essay, prompt, limit), schema: ReviewReply };
  const live = onEvent ? throttled((notes: LiveNote[]) => onEvent({ type: "notes", notes })) : null;
  const first = live
    ? streamJson(opts, (soFar) => {
        const notes = parsePartial<{ notes?: LiveNote[] }>(soFar)?.notes;
        if (notes?.length) live.push(notes);
      }).finally(() => live.flush())
    : generateJson(opts);
  const reads = await Promise.allSettled([first, ...Array.from({ length: REVIEW_READS - 1 }, () => generateJson(opts))]);
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
