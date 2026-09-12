import { env } from "@/lib/env";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";

import { runActorSync } from "./apify";
import { classifyPost, type SocialDraft } from "./read";

/**
 * Instagram, per account — the brand half and the rival half of the social
 * read share this one call.
 *
 * The Graph API only reads accounts that have authorised the app, which a
 * rival never will and most owners never get around to (see
 * `metaInstagramScopes` in lib/env.ts for why even the owner's own Reels
 * are gated). A public profile is public, so the honest route is the same
 * one the per-term TikTok read takes: a paid Apify actor, key-gated on
 * APIFY_TOKEN and skipped without it.
 */

/** Overridable because actors get renamed and deprecated out from under you. */
const DEFAULT_ACTOR = "apify/instagram-profile-scraper";
const CAPTION_CHARS = 400;

/** The subset of the profile actor's output this reads. Everything is
 * optional — actor schemas drift, and a renamed field must degrade to a
 * missing number, never throw mid-run. */
export interface ApifyInstagramPost {
  id?: string | number;
  shortCode?: string;
  url?: string;
  caption?: string;
  type?: "Image" | "Video" | "Sidecar" | string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  isSponsored?: boolean;
}

export interface ApifyInstagramItem {
  username?: string;
  followersCount?: number;
  postsCount?: number;
  latestPosts?: ApifyInstagramPost[];
}

function mediaType(type: string | undefined): SocialDraft["media_type"] {
  if (type === "Video") return "video";
  if (type === "Sidecar") return "carousel";
  return "image";
}

function isoOrNull(raw: string | undefined): string | null {
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

export function toInstagramPosts(items: ApifyInstagramItem[]): SocialDraft[] {
  const out: SocialDraft[] = [];
  for (const item of items) {
    for (const p of item.latestPosts ?? []) {
      const externalId = String(p.id ?? p.shortCode ?? "");
      // No id means no way to dedupe against last week's capture; skip
      // rather than store the same post under a new row every run.
      if (!externalId) continue;
      const caption = (p.caption ?? "").slice(0, CAPTION_CHARS);
      out.push({
        platform: "instagram",
        external_id: externalId,
        url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ""),
        caption,
        media_type: mediaType(p.type),
        posted_at: isoOrNull(p.timestamp),
        likes: Number(p.likesCount) || 0,
        comments: Number(p.commentsCount) || 0,
        shares: 0,
        // The actor reports plays on newer runs and views on older ones;
        // either is the number the owner sees under the Reel.
        views: Number(p.videoPlayCount) || Number(p.videoViewCount) || 0,
        is_ad: p.isSponsored === true,
        kind: classifyPost(caption),
      });
    }
  }
  return out;
}

const breaker = new CircuitBreaker("social_instagram");

/** One account's recent posts, or [] — a dead actor is a warning, never a
 * failed social read. */
export async function fetchInstagramPosts(
  handle: string,
  opts: { fetchText?: typeof fetchText; breaker?: CircuitBreaker } = {},
): Promise<SocialDraft[]> {
  if (!env.apifyToken || !handle) return [];
  const actor = env.apifyInstagramActor || DEFAULT_ACTOR;
  try {
    const items = await runActorSync<ApifyInstagramItem>(
      actor,
      { usernames: [handle] },
      { breaker: opts.breaker ?? breaker, fetchText: opts.fetchText },
    );
    return toInstagramPosts(items);
  } catch (err) {
    console.warn(`[social:instagram] @${handle} failed:`, (err as Error).message);
    return [];
  }
}
