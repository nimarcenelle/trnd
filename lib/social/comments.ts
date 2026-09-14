import { env } from "@/lib/env";
import type { NewSocialComment, SocialPlatform } from "@/lib/db/types";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";

import { runActorSync } from "./apify";

/**
 * What people write under a post: the brand's own and its rivals'.
 *
 * Every read the product had of "the customer" was something a brand wrote
 * (captions, ad copy) or something a stranger searched. Comments are the
 * one place a specific brand's specific customers say, in their own words,
 * what they want to know before they buy: "does it work with a handheld",
 * "what does it actually remove", "mine cut the pressure". The Customer
 * signal's intent read is built to classify exactly that text and had
 * almost none of it.
 *
 * Both readers are paid Apify actors keyed on APIFY_TOKEN, each with a
 * per-post cap so a viral post cannot bill a thousand comments. Verified
 * 2026-09-14 against live runs: the Instagram actor returns {postUrl, id,
 * text, ownerUsername, timestamp, likesCount}, the TikTok one {videoWebUrl,
 * cid, text, uniqueId, createTimeISO, diggCount}. Every field is optional
 * in the mapper: a renamed key is a missing fact, never a failed read.
 */

const DEFAULT_INSTAGRAM_ACTOR = "apify/instagram-comment-scraper";
const DEFAULT_TIKTOK_ACTOR = "clockworks/tiktok-comments-scraper";
const TEXT_CHARS = 300;

/** Comments read per post: enough to hear the room, capped for the bill. */
export const COMMENTS_PER_POST = 30;

export type CommentDraft = Omit<NewSocialComment, "business_id" | "competitor_id">;

type Item = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const iso = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Pure: the Instagram actor's items into comment drafts, keyed to the post they hang off. */
export function toInstagramComments(items: unknown[]): CommentDraft[] {
  const out: CommentDraft[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Item;
    const id = str(i.id ?? i.commentId);
    const text = str(i.text).slice(0, TEXT_CHARS);
    const postUrl = str(i.postUrl);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({
      platform: "instagram",
      post_external_id: postExternalId("instagram", postUrl),
      external_id: id,
      author: str(i.ownerUsername ?? (i.owner as Item | undefined)?.username).slice(0, 80),
      text,
      likes: num(i.likesCount),
      posted_at: iso(i.timestamp),
    });
  }
  return out;
}

/** Pure: the TikTok actor's items into comment drafts. */
export function toTiktokComments(items: unknown[]): CommentDraft[] {
  const out: CommentDraft[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Item;
    const id = str(i.cid ?? i.id);
    const text = str(i.text).slice(0, TEXT_CHARS);
    const postUrl = str(i.videoWebUrl ?? i.submittedVideoUrl ?? i.input);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({
      platform: "tiktok",
      post_external_id: postExternalId("tiktok", postUrl),
      external_id: id,
      author: str(i.uniqueId).slice(0, 80),
      text,
      likes: num(i.diggCount),
      posted_at: iso(i.createTimeISO ?? i.createTime),
    });
  }
  return out;
}

/**
 * The post's id as social_posts stores it, from its URL: Instagram's short
 * code, TikTok's numeric video id. Falls back to the URL itself so a comment
 * is never orphaned by an unfamiliar link shape.
 */
export function postExternalId(platform: SocialPlatform, url: string): string {
  if (platform === "instagram") return url.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)?.[1] ?? url;
  if (platform === "tiktok") return url.match(/\/video\/(\d+)/)?.[1] ?? url;
  return url;
}

const igBreaker = new CircuitBreaker("social_comments_instagram");
const ttBreaker = new CircuitBreaker("social_comments_tiktok");

/** Comments under the given post URLs; [] without a key, on a dead actor, or on a platform with no reader. */
export async function fetchPostComments(
  platform: SocialPlatform,
  postUrls: string[],
  opts: { perPost?: number; fetchText?: typeof fetchText } = {},
): Promise<CommentDraft[]> {
  if (!env.apifyToken || postUrls.length === 0) return [];
  const perPost = opts.perPost ?? COMMENTS_PER_POST;
  try {
    if (platform === "instagram") {
      const items = await runActorSync<unknown>(
        env.apifyInstagramActor && /comment/i.test(env.apifyInstagramActor) ? env.apifyInstagramActor : DEFAULT_INSTAGRAM_ACTOR,
        { directUrls: postUrls, resultsLimit: perPost, includeNestedComments: false },
        { breaker: igBreaker, fetchText: opts.fetchText },
      );
      return toInstagramComments(items);
    }
    if (platform === "tiktok") {
      const items = await runActorSync<unknown>(
        DEFAULT_TIKTOK_ACTOR,
        { postURLs: postUrls, commentsPerPost: perPost, maxRepliesPerComment: 0 },
        { breaker: ttBreaker, fetchText: opts.fetchText },
      );
      return toTiktokComments(items);
    }
    return [];
  } catch (err) {
    console.warn(`[social:comments] ${platform} read failed:`, (err as Error).message);
    return [];
  }
}
