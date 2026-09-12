import { env } from "@/lib/env";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";

import { runActorSync } from "./apify";
import { classifyPost, type SocialDraft } from "./read";

/**
 * Facebook, per Page. For a local business this is often the account that
 * actually posts — the specials board, the "closed Monday" notice — and
 * the one with no public API at all: Page reads need a token from the Page
 * owner, which a rival is not. So, an Apify actor, key-gated on APIFY_TOKEN.
 *
 * Page-post actors are the least stable of the three schemas (field names
 * have changed twice in a year), so every field here is optional and the
 * mapper reads alternates where they are known to exist.
 */

/** Overridable because actors get renamed and deprecated out from under you. */
const DEFAULT_ACTOR = "apify/facebook-posts-scraper";
const RESULTS_LIMIT = 30;
const CAPTION_CHARS = 400;

export interface ApifyFacebookMedia {
  type?: string;
  url?: string;
  thumbnail?: string;
  __typename?: string;
}

export interface ApifyFacebookItem {
  postId?: string | number;
  id?: string | number;
  url?: string;
  postUrl?: string;
  text?: string;
  message?: string;
  /** ISO string on current runs. */
  time?: string;
  /** Unix seconds (or ms) on older runs; an ISO string on some. */
  timestamp?: number | string;
  likes?: number;
  reactionsCount?: number;
  comments?: number;
  commentsCount?: number;
  shares?: number;
  sharesCount?: number;
  viewsCount?: number;
  media?: ApifyFacebookMedia[];
  isVideo?: boolean;
  isSponsored?: boolean;
  isAd?: boolean;
}

function isVideoMedia(m: ApifyFacebookMedia): boolean {
  const t = `${m.type ?? ""} ${m.__typename ?? ""}`.toLowerCase();
  return t.includes("video");
}

function mediaType(i: ApifyFacebookItem): SocialDraft["media_type"] {
  const media = i.media ?? [];
  if (i.isVideo === true || media.some(isVideoMedia)) return "video";
  if (media.length > 1) return "carousel";
  if (media.length === 1) return "image";
  return "text";
}

function postedAt(i: ApifyFacebookItem): string | null {
  if (i.time) {
    const at = Date.parse(i.time);
    if (Number.isFinite(at)) return new Date(at).toISOString();
  }
  if (typeof i.timestamp === "string" && !/^\d+$/.test(i.timestamp.trim())) {
    const at = Date.parse(i.timestamp);
    return Number.isFinite(at) ? new Date(at).toISOString() : null;
  }
  const ts = Number(i.timestamp);
  if (Number.isFinite(ts) && ts > 0) {
    // Seconds unless it is plainly milliseconds.
    return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
  }
  return null;
}

export function toFacebookPosts(items: ApifyFacebookItem[]): SocialDraft[] {
  const out: SocialDraft[] = [];
  for (const i of items) {
    const externalId = String(i.postId ?? i.id ?? "");
    if (!externalId) continue;
    const caption = (i.text ?? i.message ?? "").slice(0, CAPTION_CHARS);
    out.push({
      platform: "facebook",
      external_id: externalId,
      url: i.url || i.postUrl || "",
      caption,
      media_type: mediaType(i),
      posted_at: postedAt(i),
      likes: Number(i.likes) || Number(i.reactionsCount) || 0,
      comments: Number(i.comments) || Number(i.commentsCount) || 0,
      shares: Number(i.shares) || Number(i.sharesCount) || 0,
      views: Number(i.viewsCount) || 0,
      is_ad: i.isSponsored === true || i.isAd === true,
      kind: classifyPost(caption),
    });
  }
  return out;
}

const breaker = new CircuitBreaker("social_facebook");

/** One Page's recent posts, or [] — a dead actor is a warning, never a
 * failed social read. */
export async function fetchFacebookPosts(
  handle: string,
  opts: { fetchText?: typeof fetchText; breaker?: CircuitBreaker } = {},
): Promise<SocialDraft[]> {
  if (!env.apifyToken || !handle) return [];
  const actor = env.apifyFacebookActor || DEFAULT_ACTOR;
  try {
    const items = await runActorSync<ApifyFacebookItem>(
      actor,
      { startUrls: [{ url: `https://www.facebook.com/${handle}` }], resultsLimit: RESULTS_LIMIT },
      { breaker: opts.breaker ?? breaker, fetchText: opts.fetchText },
    );
    return toFacebookPosts(items);
  } catch (err) {
    console.warn(`[social:facebook] ${handle} failed:`, (err as Error).message);
    return [];
  }
}
