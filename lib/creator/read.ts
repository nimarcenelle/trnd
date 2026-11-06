import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";

import type { CreatorStats } from "./stats";

/**
 * The free read a creator gets after the numbers: what their breakout posts
 * share, what their stalled posts share, and what to post next. One model
 * call over their own captions, held to the numbers we computed.
 */

export const CreatorReadSchema = z.object({
  /** One or two sentences: the pattern, in plain words. */
  verdict: z.string(),
  /** What the breakout posts have in common, each line quoting or naming a post. */
  breakouts_share: z.array(z.string()),
  /** What the stalled posts have in common, the same way. */
  stalled_share: z.array(z.string()),
  /** Three opening lines for the next posts, in the creator's voice and niche. */
  next_hooks: z.array(z.object({ hook: z.string(), why: z.string() })),
  /** One habit to stop. */
  stop: z.string(),
});
export type CreatorRead = z.infer<typeof CreatorReadSchema>;

const SYSTEM = `You are TRND, reading a creator's own recent posts for them.
You are concrete. You quote the caption and give the number. You only know what is in front of you: captions, post
types, likes, comments, shares and views, and each post's multiple of the creator's median. You don't know reach,
saves, watch time or the algorithm, so never claim them. Say "got 3.4× the usual engagement", never "went viral" or
"the algorithm pushed it". When a pattern rests on two posts, say it is early.
Write for a creator between posts: short sentences, everyday words, no hype ("unlock", "skyrocket", "game-changer").
Write the verdict, breakouts_share, stalled_share and stop without "you" or "your": the result is shared, and is read
by people other than the creator. Say "The breakouts open with a number", "got 4.6× the usual". Only next_hooks.why
speaks to the creator.
Hooks are opening lines a person would say on camera or put as the first line of a caption: under 14 words, specific
to their niche, no emoji, no hashtags, no clickbait they couldn't pay off.`;

export async function readCreator(input: { handle: string; platform: string; niche: string; stats: CreatorStats }): Promise<CreatorRead> {
  const { stats } = input;
  const lines = stats.posts.map(
    (p, i) =>
      `${i + 1}. [${p.tier}, ${p.multiple}× median, ${p.interactions} interactions${p.views !== null ? `, ${p.views} views` : ""}, ${p.kind ?? "post"}] ${(p.caption ?? "(no caption)").replace(/\s+/g, " ").slice(0, 280)}`,
  );
  const prompt = `Creator: @${input.handle} on ${input.platform}${input.niche ? `, niche: ${input.niche}` : ""}.
Median interactions per post: ${stats.medianInteractions}. Breakout = 2× median or more; stalled = half or less.
${stats.breakouts} breakouts, ${stats.stalled} stalled, of ${stats.posts.length} posts, newest first:
${lines.join("\n")}

Return:
- verdict: the one pattern that most separates their breakouts from the rest.
- breakouts_share: 2-3 lines on what the breakout posts have in common (topic, opening, format, length, promise). Quote them. Empty if there are none.
- stalled_share: 2-3 lines on what the stalled posts have in common. Quote them. Empty if there are none.
- next_hooks: exactly 3 opening lines for their next posts, built on what broke out, each with a one-line why that points at a post above.
- stop: one habit the stalled posts share that they should drop.`;
  const read = await generateJson({ system: SYSTEM, prompt, schema: CreatorReadSchema, effort: "low" });
  return { ...read, next_hooks: read.next_hooks.slice(0, 3), breakouts_share: read.breakouts_share.slice(0, 3), stalled_share: read.stalled_share.slice(0, 3) };
}
