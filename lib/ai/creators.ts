import "server-only";

import { z } from "zod";

import type { CreatorProfile, Goals, PlanBody, Video } from "@/lib/db/types";
import { goalLabel } from "@/lib/goals";

import { generateJson } from "./openai";

/**
 * The three things the model does: read a creator's account (niche, audience,
 * what works for them), tag videos with their format and opening line, and
 * write the plan a scan ends with: three videos to make next, each scripted.
 */

const SYSTEM = `You are TRND, a short-form video strategist for TikTok creators. You read a creator's public videos, the
videos of the creators a step ahead of them in their niche (the accounts they want to grow into), and what is trending
in their niche, and tell them exactly what to post next.
You are concrete: you name the video, quote the hook, give the number. You never invent numbers: TikTok shows the
public plays, likes, comments, shares and saves of a video, but not watch time, retention or followers gained, so
never claim those. Say "got 4x your usual views", never "had 70% watch-through". Write the way a smart friend who
makes TikToks talks: short sentences, everyday words, no marketing jargon, no hype words like "viral", "unlock",
"game-changer", "algorithm hack".`;

/** One video as the model sees it: id, numbers, how it compares, and its words. */
export function videoLine(v: Pick<Video, "video_id" | "author" | "caption" | "views" | "likes" | "comments" | "shares" | "saves" | "duration_s" | "posted_at" | "sound" | "format" | "hook">, times?: number | null): string {
  const n = (x: number | null) => (x === null ? "?" : x.toLocaleString("en-US"));
  return [
    `[${v.video_id}] @${v.author}`,
    v.posted_at ? v.posted_at.slice(0, 10) : null,
    v.duration_s ? `${v.duration_s}s` : null,
    `${n(v.views)} views, ${n(v.likes)} likes, ${n(v.comments)} comments, ${n(v.shares)} shares, ${n(v.saves)} saves`,
    times !== undefined && times !== null ? `${times}x their usual views` : null,
    v.format ? `format: ${v.format}` : null,
    v.sound ? `sound: ${v.sound}` : null,
    `"${(v.caption ?? "").replace(/\s+/g, " ").slice(0, 220)}"`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* --------------------------- read the account ---------------------------- */

const AccountSchema = z.object({
  niche: z.array(z.string()),
  audience: z.array(z.string()),
  works: z.array(z.string()),
  doesnt: z.array(z.string()),
  style: z.string(),
  /** Hashtags to watch for trends and for creators ahead of them. */
  hashtags: z.array(z.string()),
});
export type AccountRead = z.infer<typeof AccountSchema>;

export async function readAccount(input: { handle: string; name: string | null; bio: string | null; followers: number | null; videos: string[] }): Promise<AccountRead> {
  return generateJson({
    system: SYSTEM,
    schema: AccountSchema,
    effort: "low",
    prompt: `Here is @${input.handle}${input.name ? ` (${input.name})` : ""} on TikTok, ${input.followers?.toLocaleString("en-US") ?? "an unknown number of"} followers.
Bio: ${input.bio ?? "none"}

Their recent videos, with "x their usual views" against their own median:
${input.videos.join("\n")}

Return:
- niche: 2-4 short topic labels for what they post (e.g. "Study tips", "College admissions").
- audience: 2-4 short labels for who likely watches, judged from the topics and comments (e.g. "High school seniors"). These are estimates.
- works: 2-4 patterns their best videos share, each a short phrase grounded in the numbers (e.g. "Numbered series", "The result in the first line").
- doesnt: 1-3 patterns their weakest videos share (e.g. "Sponsor before the payoff", "Over 50 seconds").
- style: their recognizable way of making videos, in one sentence (e.g. "Narrated tabletop explainers with paper cutouts").
- hashtags: 5-8 hashtags, without #, that people in this niche actually use and that best find creators in their niche: specific
  ones ("collegeapps", "studytok") over broad ones ("fyp", "viral", "foryou", "motivation").`,
  });
}

/* ------------------------------ tag videos -------------------------------- */

const TagSchema = z.object({ videos: z.array(z.object({ id: z.string(), format: z.string(), hook: z.string() })) });

/** Format and opening line for each video. Batched; ids the model drops stay untagged. */
export async function tagVideos(videos: Pick<Video, "video_id" | "caption" | "duration_s" | "author">[]): Promise<Map<string, { format: string; hook: string }>> {
  const out = new Map<string, { format: string; hook: string }>();
  for (let i = 0; i < videos.length; i += 40) {
    const batch = videos.slice(i, i + 40);
    const res = await generateJson({
      system: SYSTEM,
      schema: TagSchema,
      effort: "low",
      prompt: `For each TikTok video below, from its caption and length, return:
- format: what kind of video it is in 2-4 words, from a consistent vocabulary where you can ("ranked list", "tutorial",
  "storytime", "day in my life", "POV skit", "before and after", "myth vs fact", "reaction", "series part", "Q&A reply",
  "product review", "challenge", "talking head tip").
- hook: the likely opening line, in under 15 words, taken from the caption where it gives one.

${batch.map((v) => `[${v.video_id}] @${v.author} · ${v.duration_s ?? "?"}s · "${(v.caption ?? "").replace(/\s+/g, " ").slice(0, 200)}"`).join("\n")}`,
    });
    for (const t of res.videos) out.set(t.id, { format: t.format.toLowerCase(), hook: t.hook });
  }
  return out;
}

/* ------------------------------ the plan ---------------------------------- */

const IdeaSchema = z.object({
  type: z.enum(["double_down", "borrow", "ride"]),
  hook: z.string(),
  so: z.string(),
  script: z.array(z.object({ t: z.string(), say: z.string(), shot: z.string() })),
  length: z.string(),
  sound: z.string(),
  post_time: z.string(),
  format: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  why: z.array(z.string()),
  make_it_yours: z.string(),
  source_video: z.string(),
  source_trend: z.string(),
});

const PlanSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  ideas: z.array(IdeaSchema),
  patterns: z.array(z.object({ title: z.string(), detail: z.string(), videos: z.array(z.string()) })),
});

export interface PlanInput {
  handle: string;
  followers: number | null;
  profile: CreatorProfile | null;
  goals: Goals | null;
  today: string;
  normal: { views: number | null; low: number | null; high: number | null; perWeek: number | null };
  own: string[];
  borrow: string[];
  trends: string[];
  past: string[];
}

export async function writePlan(input: PlanInput): Promise<PlanBody> {
  const goal = input.goals ? `${goalLabel(input.goals.goal)}. Posts per week they can make: ${input.goals.posts_per_week || "not said"}. Target: ${input.goals.target || "not said"}. Also: ${input.goals.notes || "nothing"}.` : "Not set yet: assume growing followers.";
  const p = input.profile;
  return generateJson({
    system: SYSTEM,
    schema: PlanSchema,
    prompt: `Today is ${input.today}. Write @${input.handle}'s plan for this week.

<creator>
Followers: ${input.followers?.toLocaleString("en-US") ?? "unknown"}. Posts about ${input.normal.perWeek ?? "?"} times a week.
Typical video: ${input.normal.views?.toLocaleString("en-US") ?? "?"} views (middle half ${input.normal.low?.toLocaleString("en-US") ?? "?"} to ${input.normal.high?.toLocaleString("en-US") ?? "?"}).
${p ? `Niche: ${p.niche.join(", ")}. Audience (estimated): ${p.audience.join(", ")}. Style: ${p.style}.
What works for them: ${p.works.join("; ")}. What doesn't: ${p.doesnt.join("; ")}.` : ""}
Goal: ${goal}
</creator>

<their_videos>
${input.own.join("\n") || "none read"}
</their_videos>

<worth_borrowing>
Videos from creators ahead of them in this niche (bigger accounts they want to grow into, matched by us or named by
them), each one that beat its own creator's usual views, with a 0-100 borrow score (beat their normal, fits this niche,
fresh, saved). Learn what got those creators to where they are, not what an equal is doing:
${input.borrow.join("\n") || "none found"}
</worth_borrowing>

<trending_in_niche>
Hashtags and sounds in the videos we read from this niche, with how many videos used them this week vs last week, and the stage:
${input.trends.join("\n") || "none found"}
</trending_in_niche>

<last_plans>
How earlier ideas did when posted:
${input.past.join("\n") || "no earlier ideas posted yet"}
</last_plans>

Return:
- headline: this week's answer in one or two sentences: what their own numbers say people come for, and the one move to
  make now. Name the format or topic. You may wrap at most two key phrases in *asterisks* for emphasis.
- summary: one or two sentences on the three ideas below and how they serve the goal. No predictions of follower counts.
- ideas: exactly three, ranked by how well each serves the goal, and where the evidence allows one of each type:
  - double_down: builds on one of THEIR videos that beat their usual views. source_video = its id.
  - borrow: adapts a format from a video in worth_borrowing, by a creator ahead of them, to their size and style. source_video = its id.
  - ride: joins a hashtag or sound in trending_in_niche that is early or rising. source_trend = its key exactly as listed, source_video = "".
  If a type has no evidence, use another type with evidence instead. Never invent a source. Each idea:
  - hook: the exact first line they say, in quotes, under 15 words, specific to them.
  - so: why this, why now, for them, in two sentences, citing the numbers.
  - script: 3-5 beats; t is the seconds ("0-2s"), say is what they say, shot is what is on screen, in their style.
  - length (e.g. "35-40s"), sound (their voiceover, or the trending sound by name), post_time (a day and time with a
    short reason; say "when your audience is free" rather than claiming analytics you don't have), format (in their style).
  - caption: one line that asks for a comment. hashtags: 3-5, with #, specific ones first.
  - why: 2-3 reasons it works, each tied to something in the evidence.
  - make_it_yours: one sentence on keeping it theirs, not a copy (or, for double_down, the one thing to change).
- patterns: 2-3 things their own numbers show (e.g. "Saves are 3x higher on tutorials"), each with the ids of the videos
  that show it.`,
  });
}
