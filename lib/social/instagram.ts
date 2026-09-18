import { env, isInstagramConfigured } from "@/lib/env";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";
import { recordProviderUsage } from "@/lib/usage/providers";

import { runActorSync } from "./apify";
import { classifyPost, type SocialDraft } from "./read";

/**
 * Instagram, per account — the brand half and the rival half of the social
 * read share this one call.
 *
 * Two paths, the free one first. Meta's Business Discovery endpoint reads
 * any public professional account's recent media — caption, type, likes,
 * comment count, permalink, timestamp — as long as the CALLER is a
 * professional account with a role on the app. That is our own account,
 * so it needs no App Review and no consent from the rival; the app stays
 * in development mode. Two hundred calls an hour, no bill. It does not
 * report plays on Reels, and an account that hides its likes reports none.
 *
 * Without INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ID, or when the
 * endpoint cannot find the account (a personal account, a typo), the paid
 * Apify actor reads the public profile instead, key-gated on APIFY_TOKEN
 * and skipped without it.
 */

/* ------------------------- Business Discovery (free) ------------------------ */

/** Tokens from Instagram Login start "IG" and speak to graph.instagram.com;
 * tokens from Facebook Login start "EAA" and speak to graph.facebook.com.
 * Both host the same business_discovery field. */
export function graphBaseFor(token: string): string {
  return token.startsWith("IG") ? "https://graph.instagram.com/v21.0" : "https://graph.facebook.com/v21.0";
}

export const DISCOVERY_MEDIA_LIMIT = 30;
const DISCOVERY_FIELDS = `business_discovery.username({handle}){username,followers_count,media_count,media.limit(${DISCOVERY_MEDIA_LIMIT}){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;

export interface DiscoveryMedia {
  id?: string;
  caption?: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  media_product_type?: "FEED" | "REELS" | "AD" | string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export interface DiscoveryResponse {
  business_discovery?: {
    username?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data?: DiscoveryMedia[] };
  };
  error?: { message?: string; code?: number; error_subcode?: number };
}

function discoveryMediaType(type: string | undefined): SocialDraft["media_type"] {
  if (type === "VIDEO") return "video";
  if (type === "CAROUSEL_ALBUM") return "carousel";
  return "image";
}

export function toDiscoveryPosts(res: DiscoveryResponse): SocialDraft[] {
  const out: SocialDraft[] = [];
  for (const m of res.business_discovery?.media?.data ?? []) {
    if (!m.id) continue;
    const caption = (m.caption ?? "").slice(0, CAPTION_CHARS);
    out.push({
      platform: "instagram",
      external_id: String(m.id),
      url: m.permalink ?? "",
      caption,
      media_type: discoveryMediaType(m.media_type),
      posted_at: isoOrNull(m.timestamp),
      likes: Number(m.like_count) || 0,
      comments: Number(m.comments_count) || 0,
      shares: 0,
      // Business Discovery reports no plays; the Reel's views stay unknown
      // rather than zero-as-a-number, which readAccount treats as "no views".
      views: 0,
      is_ad: m.media_product_type === "AD",
      kind: classifyPost(caption),
    });
  }
  return out;
}

const discoveryBreaker = new CircuitBreaker("instagram_discovery");

/**
 * The free read. Returns null when the endpoint could not answer for this
 * handle (not configured, not a professional account, rate-limited, token
 * expired), so the caller can fall back; [] is a real answer of no posts.
 */
export async function fetchInstagramPostsViaDiscovery(
  handle: string,
  opts: { fetchText?: typeof fetchText; breaker?: CircuitBreaker } = {},
): Promise<SocialDraft[] | null> {
  if (!isInstagramConfigured || !handle) return null;
  const doFetchText = opts.fetchText ?? fetchText;
  const fields = DISCOVERY_FIELDS.replace("{handle}", handle.replace(/[^a-z0-9._]/gi, ""));
  const url = `${graphBaseFor(env.instagramToken)}/${encodeURIComponent(env.instagramUserId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(env.instagramToken)}`;
  let text: string;
  try {
    text = await doFetchText(url, { breaker: opts.breaker ?? discoveryBreaker, timeoutMs: 20_000, attempts: 1 });
  } catch (err) {
    // A 400 here is "no such professional account" as often as a bad
    // token; either way the paid read decides, and the meter says why.
    recordProviderUsage({ provider: "other", operation: "instagram_business_discovery", units: 1, ok: false, note: (err as Error).message });
    return null;
  }
  let parsed: DiscoveryResponse;
  try {
    parsed = JSON.parse(text) as DiscoveryResponse;
  } catch {
    recordProviderUsage({ provider: "other", operation: "instagram_business_discovery", units: 1, ok: false, note: "answer was not JSON" });
    return null;
  }
  if (parsed.error || !parsed.business_discovery) {
    recordProviderUsage({ provider: "other", operation: "instagram_business_discovery", units: 1, ok: false, note: parsed.error?.message ?? "no business_discovery in answer" });
    return null;
  }
  const posts = toDiscoveryPosts(parsed);
  recordProviderUsage({ provider: "other", operation: "instagram_business_discovery", units: 1, note: `@${handle}: ${posts.length} posts, free` });
  return posts;
}

/* ------------------------------ Apify (paid) ------------------------------- */

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
 * failed social read. The free Graph read answers first; the paid actor
 * only runs for a handle it could not answer for. */
export async function fetchInstagramPosts(
  handle: string,
  opts: { fetchText?: typeof fetchText; breaker?: CircuitBreaker; discovery?: typeof fetchInstagramPostsViaDiscovery } = {},
): Promise<SocialDraft[]> {
  if (!handle) return [];
  const free = await (opts.discovery ?? fetchInstagramPostsViaDiscovery)(handle, { fetchText: opts.fetchText });
  if (free !== null) return free;
  if (!env.apifyToken) return [];
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
