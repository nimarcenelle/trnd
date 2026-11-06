import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";

import type { Benchmark } from "./benchmark";
import type { CreatorStats } from "./stats";

/**
 * The free read a creator gets after the numbers: the one thing killing
 * their posts, why, what their hits did right, and what to post next. Blunt,
 * from their own captions, held to the numbers we computed.
 */

export const CreatorReadSchema = z.object({
  /** The one thing killing their posts, said straight. Leads the result. */
  killer: z.string(),
  /** One or two sentences: why the posts that flop flop and the hits hit. */
  verdict: z.string(),
  /** What the breakout posts have in common, each line quoting or naming a post. */
  breakouts_share: z.array(z.string()),
  /** What the stalled posts have in common, the same way. */
  stalled_share: z.array(z.string()),
  /** Three opening lines for the next posts, in the creator's voice and niche. */
  next_hooks: z.array(z.object({ hook: z.string(), why: z.string() })),
  /** One habit to stop. */
  stop: z.string(),
  /** What the top creators in their niche do that their flops don't, quoting both. Empty without a benchmark. */
  vs_niche: z.array(z.string()),
});
export type CreatorRead = z.infer<typeof CreatorReadSchema>;

const SYSTEM = `You are TRND, reading a creator's own recent posts for them.
You are concrete. You quote the caption and give the number. You only know what is in front of you: captions, post
types, likes, comments, shares and views, and each post's multiple of the creator's median. You don't know reach,
saves, watch time or the algorithm, so never claim them. Say "got 3.4× the usual engagement", never "went viral" or
"the algorithm pushed it". When a pattern rests on two posts, say it is early.
Talk straight to the creator ("your posts"), like a friend who knows the platform and won't sugarcoat it. Be blunt
about what is wrong with the posts that flopped: name it plainly, quote it, give the number. Never insult the person,
only the posts. Short sentences, everyday words, no hype ("unlock", "skyrocket", "game-changer").
Hooks are opening lines a person would say on camera or put as the first line of a caption: under 14 words, specific
to their niche, no emoji, no hashtags, no clickbait they couldn't pay off.`;

export async function readCreator(input: { handle: string; platform: string; niche: string; stats: CreatorStats; benchmark?: Benchmark | null }): Promise<CreatorRead> {
  const { stats } = input;
  const lines = stats.posts.map(
    (p, i) =>
      `${i + 1}. [${p.tier}, ${p.multiple}× median, ${p.interactions} interactions${p.views !== null ? `, ${p.views} views` : ""}, ${p.kind ?? "post"}] ${(p.caption ?? "(no caption)").replace(/\s+/g, " ").slice(0, 280)}`,
  );
  const prompt = `Creator: @${input.handle} on ${input.platform}${input.niche ? `, niche: ${input.niche}` : ""}.
Median interactions per post: ${stats.medianInteractions}. Breakout = 2× median or more; stalled = half or less.
${stats.breakouts} breakouts, ${stats.stalled} stalled, of ${stats.posts.length} posts, newest first:
${lines.join("\n")}

${input.benchmark ? `The bar: the top posts under #${input.benchmark.tag} on ${input.platform} right now (the best post of each creator):
${input.benchmark.posts.map((p, i) => `${i + 1}. @${p.handle}${p.followers ? ` (${p.followers} followers)` : ""}: ${p.interactions} interactions, ${p.timesYou}× this creator's usual post. ${(p.caption ?? "(no caption)").replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}
${input.benchmark.perFollowerGap !== null ? `Per follower, those posts pull ${input.benchmark.perFollowerGap}× what this creator's usual post does.` : ""}

` : ""}Return:
- killer: the one thing killing their posts, in one blunt sentence under 18 words, specific to these captions
  (e.g. "Your openings name the topic instead of giving anyone a reason to stay."). No numbers needed.
- verdict: why the posts that flop flop and the hits hit, in one or two sentences.
- breakouts_share: 2-3 lines on what the breakout posts have in common (topic, opening, format, length, promise). Quote them. Empty if there are none.
- stalled_share: 2-3 lines on what the stalled posts have in common. Quote them. Empty if there are none.
- next_hooks: exactly 3 opening lines for their next posts, built on what broke out, each with a one-line why that points at a post above.
- stop: one habit the stalled posts share that they should drop.
- vs_niche: if the bar is given, 2-3 lines on what the top creators in the niche do (in their openings, promises,
  formats) that this creator's flops don't. Quote one of theirs against one of the creator's each time. Empty if no bar.
  The killer and the hooks should use this too: the hooks should borrow what works at the top of the niche, in this
  creator's own voice and topics.`;
  const read = await generateJson({ system: SYSTEM, prompt, schema: CreatorReadSchema, effort: "low" });
  return { ...read, next_hooks: read.next_hooks.slice(0, 3), breakouts_share: read.breakouts_share.slice(0, 3), stalled_share: read.stalled_share.slice(0, 3), vs_niche: read.vs_niche.slice(0, 3) };
}
