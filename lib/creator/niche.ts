import "server-only";

import { generateJson } from "@/lib/ai/openai";
import { isModelConfigured } from "@/lib/env";
import { runActor } from "@/lib/social/read";
import { z } from "zod";

import type { RawNichePost } from "./benchmark";
import { toTag } from "./benchmark";

/**
 * The top posts under a niche hashtag, through Apify: TikTok's hashtag page
 * (with each author's follower count) or Instagram's (no follower counts).
 * One run per check. Fields drift between actor versions, so every one is
 * optional and a missing one drops the post, never the check.
 */

const TT_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";
const IG_TAG_ACTOR = process.env.APIFY_INSTAGRAM_HASHTAG_ACTOR || "apify~instagram-hashtag-scraper";
const PER_TAG = 30;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function mapTiktokVideo(v: Obj): RawNichePost {
  const a = isObj(v.authorMeta) ? v.authorMeta : {};
  return {
    handle: (str(a.name) ?? str(a.uniqueId))?.toLowerCase() ?? null,
    followers: num(a.fans),
    caption: str(v.text)?.slice(0, 300) ?? null,
    likes: num(v.diggCount),
    comments: num(v.commentCount),
    shares: num(v.shareCount),
    views: num(v.playCount),
    url: str(v.webVideoUrl),
  };
}

export function mapInstagramPost(p: Obj): RawNichePost {
  return {
    handle: str(p.ownerUsername)?.toLowerCase() ?? null,
    followers: null,
    caption: str(p.caption)?.slice(0, 300) ?? null,
    likes: num(p.likesCount),
    comments: num(p.commentsCount),
    shares: null,
    views: num(p.videoViewCount) ?? num(p.videoPlayCount),
    url: str(p.url),
  };
}

export async function readNiche(tag: string, platform: "tiktok" | "instagram"): Promise<RawNichePost[]> {
  if (platform === "tiktok") {
    const items = await runActor(TT_ACTOR, { hashtags: [tag], resultsPerPage: PER_TAG, shouldDownloadVideos: false, shouldDownloadCovers: false });
    return items.map(mapTiktokVideo);
  }
  const items = await runActor(IG_TAG_ACTOR, { hashtags: [tag], resultsLimit: PER_TAG });
  return items.map(mapInstagramPost);
}

/** When the creator typed no niche and their captions carry no telling hashtag: one short model call names it. */
export async function inferNicheTag(captions: (string | null)[]): Promise<string | null> {
  if (!isModelConfigured) return null;
  const { hashtag } = await generateJson({
    system: "You name a creator's niche as the single hashtag people in it use most. Lowercase, no #, no spaces, specific (\"homeworkout\", not \"fitness\" when the posts are home workouts; never \"fyp\" or \"viral\").",
    prompt: `Their recent captions:\n${captions.filter(Boolean).slice(0, 12).map((c) => `- ${c!.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}`,
    schema: z.object({ hashtag: z.string() }),
    effort: "low",
  });
  return toTag(hashtag) || null;
}
