import { env } from "@/lib/env";
import type { ApifyTikTokItem } from "@/lib/signals/adapters/tiktok-apify";
import { CircuitBreaker, fetchText } from "@/lib/signals/http";

import { runActorSync } from "./apify";
import { classifyPost, type SocialDraft } from "./read";

/**
 * TikTok, per account. The same actor the per-term read pays for
 * (`lib/signals/adapters/tiktok-apify.ts`), pointed at a profile instead of
 * a search — so one APIFY_TOKEN and one actor override cover both, and the
 * item shape is the one that file already documents.
 */

/** Overridable because actors get renamed and deprecated out from under you. */
const DEFAULT_ACTOR = "clockworks/tiktok-scraper";
const RESULTS_PER_PROFILE = 30;
const CAPTION_CHARS = 400;

/** Profile runs carry the search-run fields plus, on promoted posts, an
 * ad flag whose name has moved between actor versions. */
export type ApifyTikTokProfileItem = ApifyTikTokItem & {
  isAd?: boolean;
  isSponsored?: boolean;
};

export function toTiktokPosts(items: ApifyTikTokProfileItem[]): SocialDraft[] {
  const out: SocialDraft[] = [];
  for (const i of items) {
    const externalId = String(i.id ?? "");
    if (!externalId) continue;
    const caption = (i.text ?? "").slice(0, CAPTION_CHARS);
    const author = i.authorMeta?.name ?? "";
    const at = i.createTimeISO ? Date.parse(i.createTimeISO) : NaN;
    out.push({
      platform: "tiktok",
      external_id: externalId,
      url: i.webVideoUrl || (author ? `https://www.tiktok.com/@${author}/video/${externalId}` : ""),
      caption,
      media_type: "video",
      posted_at: Number.isFinite(at) ? new Date(at).toISOString() : null,
      likes: Number(i.diggCount) || 0,
      comments: Number(i.commentCount) || 0,
      shares: Number(i.shareCount) || 0,
      views: Number(i.playCount) || 0,
      is_ad: i.isAd === true || i.isSponsored === true,
      kind: classifyPost(caption),
    });
  }
  return out;
}

const breaker = new CircuitBreaker("social_tiktok");

/** One account's recent videos, or [] — a dead actor is a warning, never a
 * failed social read. */
export async function fetchTiktokPosts(
  handle: string,
  opts: { fetchText?: typeof fetchText; breaker?: CircuitBreaker } = {},
): Promise<SocialDraft[]> {
  if (!env.apifyToken || !handle) return [];
  const actor = env.apifyTiktokActor || DEFAULT_ACTOR;
  try {
    const items = await runActorSync<ApifyTikTokProfileItem>(
      actor,
      {
        profiles: [handle],
        resultsPerPage: RESULTS_PER_PROFILE,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
      },
      { breaker: opts.breaker ?? breaker, fetchText: opts.fetchText },
    );
    return toTiktokPosts(items);
  } catch (err) {
    console.warn(`[social:tiktok] @${handle} failed:`, (err as Error).message);
    return [];
  }
}
