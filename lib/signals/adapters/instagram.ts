import { env } from "@/lib/env";

import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";

/**
 * Instagram Reels volume per hashtag.
 *
 * The third short-form surface, and the one a local business most often
 * actually posts to. The Graph API reaches it in two steps: resolve a
 * hashtag to an id, then read its recent media. There is no keyless path —
 * this needs an Instagram Business account linked to a Facebook Page, the
 * instagram_basic scope, and App Review — so the adapter is key-gated and
 * registers unavailable until INSTAGRAM_ACCESS_TOKEN and
 * INSTAGRAM_BUSINESS_ID exist.
 *
 * The hard limit is Meta's, not ours: **30 unique hashtags per seven days**
 * per business account, counted across the whole window rather than per
 * call. Exceeding it does not slow the adapter down, it stops it — so
 * hashtag ids are cached for the run, only a business's own terms are
 * spent, and the cap is enforced here rather than discovered as a 400.
 *
 * What it adds that YouTube cannot: Reels is where the local operators
 * actually are. A Shorts read tells you what the internet is watching; a
 * Reels read on the same term tells you whether anyone near you is making
 * it.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
/** Meta's own ceiling, per business account per rolling week. */
export const HASHTAG_WEEK_CAP = 30;
const WINDOW_DAYS = 7;

interface HashtagSearchResponse {
  data?: { id?: string }[];
}
interface RecentMediaResponse {
  data?: {
    id?: string;
    media_type?: string;
    like_count?: number;
    comments_count?: number;
    permalink?: string;
    caption?: string;
    timestamp?: string;
  }[];
}

export interface ReelsRead {
  /**
   * Reels in the sample, NOT a total.
   *
   * `recent_media` returns one page, so this saturates at the page size the
   * same way the first YouTube adapter's "video_volume" did — every busy
   * hashtag reported the same capped number and the delta was meaningless.
   * It is kept as context for the facts panel and is deliberately not what
   * the demand score reads.
   */
  reels: number;
  /** Everything posted under it, Reels or not — the denominator. */
  posts: number;
  reactions: number;
  /** Daily Reel counts for the demand line. */
  daily: { day: string; count: number }[];
  top: { id: string; permalink: string; caption: string; reactions: number } | null;
}

/** A hashtag as Instagram wants it: letters and digits, no punctuation. */
export function hashtagFor(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

/**
 * Pure: recent media → the Reels read.
 *
 * Only VIDEO media counts as a Reel. The endpoint returns images and
 * carousels under the same hashtag, and counting those as short-form would
 * inflate the one number this adapter exists to report.
 */
export function readReels(
  media: RecentMediaResponse["data"] = [],
  now = new Date(),
): ReelsRead {
  const floor = now.getTime() - WINDOW_DAYS * 86400_000;
  const read: ReelsRead = { reels: 0, posts: 0, reactions: 0, daily: [], top: null };
  const byDay = new Map<string, number>();

  for (const m of media ?? []) {
    const at = Date.parse(m.timestamp ?? "");
    if (!Number.isFinite(at) || at < floor || at > now.getTime()) continue;
    read.posts += 1;
    if (m.media_type !== "VIDEO") continue;
    read.reels += 1;
    const reactions = (m.like_count ?? 0) + (m.comments_count ?? 0);
    read.reactions += reactions;
    const day = new Date(at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    if (m.id && (!read.top || reactions > read.top.reactions)) {
      read.top = {
        id: m.id,
        permalink: m.permalink ?? "",
        caption: (m.caption ?? "").slice(0, 200),
        reactions,
      };
    }
  }

  read.daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
  return read;
}

/** Instagram Graph — only with a token and the business account to read as. */
export function createInstagramAdapter(
  opts: { fetchJson?: typeof fetchJson; hashtagCap?: number } = {},
): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("instagram");
  const seriesCache: RawSeriesPoint[] = [];
  const idCache = new Map<string, string>();

  const hashtagId = async (tag: string): Promise<string | null> => {
    const cached = idCache.get(tag);
    if (cached) return cached;
    const res = await doFetchJson<HashtagSearchResponse>(
      `${GRAPH}/ig_hashtag_search?user_id=${encodeURIComponent(env.instagramUserId)}` +
        `&q=${encodeURIComponent(tag)}&access_token=${encodeURIComponent(env.instagramToken)}`,
      { breaker },
    );
    const id = res.data?.[0]?.id ?? null;
    if (id) idCache.set(tag, id);
    return id;
  };

  return {
    name: "instagram",
    async isAvailable() {
      return Boolean(env.instagramToken && env.instagramUserId) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      seriesCache.length = 0;
      const cap = opts.hashtagCap ?? HASHTAG_WEEK_CAP;

      // Deduped on the hashtag, not the term: "cold plunge nyc" and "cold
      // plunge" are one hashtag and must not spend two of thirty.
      const targets: { tag: string; term: string; category: string; geo?: string }[] = [];
      const seen = new Set<string>();
      for (const w of watch.filter((w) => w.geo)) {
        const tag = hashtagFor(w.term);
        if (tag.length < 3 || seen.has(tag)) continue;
        seen.add(tag);
        targets.push({ tag, term: w.term, category: w.category, geo: w.geo });
        if (targets.length >= cap) break;
      }

      for (const target of targets) {
        if (breaker.isOpen) return out;
        const termGeo = target.geo ?? geo ?? "US";
        try {
          const id = await hashtagId(target.tag);
          if (!id) continue;
          const media = await doFetchJson<RecentMediaResponse>(
            `${GRAPH}/${id}/recent_media?user_id=${encodeURIComponent(env.instagramUserId)}` +
              `&fields=id,media_type,like_count,comments_count,permalink,caption,timestamp` +
              `&access_token=${encodeURIComponent(env.instagramToken)}`,
            { breaker },
          );
          const read = readReels(media.data);
          // No Reels at all is no read; Reels with no reaction yet is a real
          // zero that the score should see rather than a row worth storing.
          if (read.reels === 0 || read.reactions === 0) continue;
          seriesCache.push(
            ...read.daily.map((d) => ({ term: target.term, geo: termGeo, day: d.day, value: d.count })),
          );
          out.push({
            source: "instagram",
            term: target.term,
            category: target.category,
            geo: termGeo,
            metric_type: "reel_reactions",
            // Reactions, not the Reel count. The count saturates at the
            // page size and would report the same number for a hashtag with
            // fifty posts and one with fifty thousand; reactions on the same
            // sample measure attention and do not cap.
            value: read.reactions,
            // Recent media is a 7-day window with no prior half to compare
            // against, so there is no honest weekly delta on the first read.
            // The daily series gives the ranking its movement instead.
            delta_pct: null,
            window_days: Math.min(windowDays, WINDOW_DAYS),
            raw: {
              hashtag: target.tag,
              reels: read.reels,
              posts: read.posts,
              reactions: read.reactions,
              top: read.top,
            },
          });
        } catch (err) {
          console.warn(`[signals:instagram] #${target.tag} failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache;
    },
  };
}
