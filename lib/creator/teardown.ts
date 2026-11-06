import "server-only";

import { z } from "zod";

import { generateJson } from "@/lib/ai/openai";

import type { CreatorRead } from "./read";
import type { CreatorStats } from "./stats";

/**
 * A teardown: a short faceless video about one public creator's last posts,
 * which broke out, which stalled and why, ending on "check yours free". The
 * check is the research; this writes the script from it.
 */

export const TeardownSchema = z.object({
  /** For the studio list, not the video. */
  title: z.string(),
  /** The first line, said and shown in the first two seconds. */
  hook: z.string(),
  /** 4-6 beats: what the voiceover says and what is on screen while it does. */
  beats: z.array(
    z.object({
      say: z.string(),
      show: z.string(),
      /**
       * What the studio's video player draws for this beat: the creator's card ("intro"), the bars of every post
       * ("chart"), one post up close ("post"), breakout openings against stalled ones ("compare"), or one big line ("text").
       */
      visual: z.enum(["intro", "chart", "post", "compare", "text"]),
      /** For "post": the post's number in the list (1 = newest). Otherwise null. */
      post: z.number().nullable(),
      /** On-screen text for this beat, at most 7 words. */
      overlay: z.string(),
    }),
  ),
  /** The last spoken line: the call to check your own posts. */
  cta: z.string(),
  /** The post's caption. */
  caption: z.string(),
  /** A comment to pin, carrying the link where the platform allows one. */
  pinned_comment: z.string(),
});
export type TeardownScript = z.infer<typeof TeardownSchema>;

const SYSTEM = `You write short faceless videos for TRND's own account: a voiceover over screen recordings of a public creator's
posts, with numbers on screen. The format: what most creators don't know, shown on one real account.
Rules:
- About the posts, never the person. Credit the creator by handle, respectfully. No mocking, no "flop", no guessing at
  their income, life or motives. A creator should be glad to be featured.
- Only the numbers given: likes + comments + shares, each post's multiple of the creator's own median. Never reach,
  views you weren't given, saves, watch time or "the algorithm". Say "got 4× their usual engagement".
- 30-45 seconds spoken (about 90-120 words in "say" across all beats). Short sentences. Everyday words. No hype words
  ("insane", "secret", "unlock", "game-changer"), no emoji, no hashtags in the script.
- The hook is a curiosity gap a stranger in this niche would stop for, under 12 words, and the video pays it off.
- "show" is a direction an editor can follow: which post to screen-record and the text or number to overlay.
- Each beat also picks the visual TRND's player draws while it is said: "intro" (the creator, their usual post),
  "chart" (every post as a bar against their usual), "post" (one post up close; give its number in "post"),
  "compare" (breakout openings against stalled openings) or "text" (the overlay alone, big). Open with "intro", use
  "chart" once early, and point at specific posts with "post". "overlay" is the on-screen text: at most 7 words, often
  a number ("4.6× her usual").`;

export async function writeTeardown(input: { handle: string; platform: string; niche: string; stats: CreatorStats; read: CreatorRead | null; link: string }): Promise<TeardownScript> {
  const s = input.stats;
  const posts = s.posts.map((p, i) => `${i + 1}. [${p.tier}, ${p.multiple}× median] ${(p.caption ?? "(no caption)").replace(/\s+/g, " ").slice(0, 200)}`);
  const prompt = `Creator: @${input.handle} on ${input.platform}${input.niche ? `, niche: ${input.niche}` : ""}.
Median interactions per post: ${s.medianInteractions}. ${s.breakouts} of ${s.posts.length} broke out (2× median or more), ${s.stalled} stalled (half or less).
Top fifth of posts took ${Math.round(s.topShare * 100)}% of all engagement. Best post: ${s.bestMultiple}× median.
Posts, newest first:
${posts.join("\n")}
${input.read ? `\nThe read already written for this account:\nPattern: ${input.read.verdict}\nBreakouts share: ${input.read.breakouts_share.join(" | ")}\nStalled share: ${input.read.stalled_share.join(" | ")}` : ""}

Write the teardown. The cta says the check is free and runs on your own last 12 posts. The caption names @${input.handle},
says what the video shows in one line, and ends with "Free check: link in bio". The pinned comment gives this link: ${input.link}`;
  return generateJson({ system: SYSTEM, prompt, schema: TeardownSchema, effort: "medium" });
}

/** The script as plain text, ready to paste into a notes app or an editor. */
export function teardownText(t: TeardownScript): string {
  return [
    `HOOK (0-2s): ${t.hook}`,
    "",
    ...t.beats.flatMap((b, i) => [`${i + 1}. SAY: ${b.say}`, `   SHOW: ${b.show}`]),
    "",
    `CTA: ${t.cta}`,
    "",
    `CAPTION: ${t.caption}`,
    `PINNED COMMENT: ${t.pinned_comment}`,
  ].join("\n");
}
