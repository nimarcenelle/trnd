import { env } from "@/lib/env";

import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";

/**
 * YouTube Shorts — the short-form read for a business's own terms.
 *
 * The old version counted how many videos came back from one search and
 * called it "video_volume": capped at the page size, so every busy term
 * reported the same 25, with no delta at all. What a shop actually needs to
 * know is whether short-form attention on its thing is rising this week, so
 * this reads the vertical-video results for each watch term over two weeks
 * and compares them: how many Shorts went up, and how many views they pulled.
 *
 * Quota: search.list is 100 units, videos.list is 1, so a term costs ~101 of
 * the free 10,000/day. TERM_CAP keeps a run inside that with room to spare.
 */

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
/** Two weeks: one to report on, one to compare against. */
const LOOKBACK_DAYS = 14;
const TERM_CAP = 40;

interface YtSearchResponse {
  items?: { id?: { videoId?: string } }[];
}
interface YtVideosResponse {
  items?: {
    id?: string;
    snippet?: { publishedAt?: string; title?: string; channelTitle?: string };
    statistics?: { viewCount?: string };
  }[];
}

export interface ShortVideo {
  id: string;
  publishedAt: string;
  title: string;
  channel: string;
  views: number;
}

export interface ShortsRead {
  /** Shorts published in the last 7 days, and the 7 before that. */
  uploads: number;
  uploadsPrev: number;
  /** Views those Shorts have pulled in — the attention, not the supply. */
  views: number;
  viewsPrev: number;
  /** Week-over-week change in views, or null when last week was empty. */
  deltaPct: number | null;
  top: ShortVideo | null;
}

/** Pure: split the two-week window into this week and last, by publish date. */
export function readShorts(videos: ShortVideo[], now = new Date()): ShortsRead {
  const cutoff = now.getTime() - 7 * 86400_000;
  const floor = now.getTime() - LOOKBACK_DAYS * 86400_000;
  const read: ShortsRead = { uploads: 0, uploadsPrev: 0, views: 0, viewsPrev: 0, deltaPct: null, top: null };
  for (const v of videos) {
    const at = Date.parse(v.publishedAt);
    if (!Number.isFinite(at) || at < floor) continue;
    if (at >= cutoff) {
      read.uploads += 1;
      read.views += v.views;
      if (!read.top || v.views > read.top.views) read.top = v;
    } else {
      read.uploadsPrev += 1;
      read.viewsPrev += v.views;
    }
  }
  // A week with nothing to compare against is "no read", not "up infinity" —
  // the same rule the TikTok curve follows.
  if (read.viewsPrev > 0) {
    read.deltaPct = Math.max(-100, Math.min(200, Math.round(((read.views - read.viewsPrev) / read.viewsPrev) * 100)));
  }
  return read;
}

/** Pure: the daily view-weight line, so the tracker can draw the last two weeks. */
export function shortsSeries(videos: ShortVideo[], term: string, geo: string): RawSeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const v of videos) {
    const day = v.publishedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + v.views);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ term, geo, day, value }));
}

/** YouTube Data API v3 — only when YOUTUBE_API_KEY is present. */
export function createYoutubeAdapter(opts: { fetchJson?: typeof fetchJson } = {}): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("youtube");
  // fetch() and fetchSeries() run back to back over the same terms; reading
  // the API twice would double a cost that is already the run's most
  // expensive.
  const seriesCache: RawSeriesPoint[] = [];

  const readTerm = async (term: string, geo: string): Promise<ShortVideo[]> => {
    const publishedAfter = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
    const search = await doFetchJson<YtSearchResponse>(
      `${SEARCH_URL}?part=id&type=video&videoDuration=short&order=viewCount&maxResults=50` +
        `&regionCode=${encodeURIComponent(geo.slice(0, 2) || "US")}&relevanceLanguage=en` +
        `&q=${encodeURIComponent(term)}&publishedAfter=${encodeURIComponent(publishedAfter)}` +
        `&key=${env.youtubeApiKey}`,
      { breaker },
    );
    const ids = (search.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];
    const details = await doFetchJson<YtVideosResponse>(
      `${VIDEOS_URL}?part=snippet,statistics&id=${ids.join(",")}&key=${env.youtubeApiKey}`,
      { breaker },
    );
    return (details.items ?? []).map((v) => ({
      id: v.id ?? "",
      publishedAt: v.snippet?.publishedAt ?? "",
      title: v.snippet?.title ?? "",
      channel: v.snippet?.channelTitle ?? "",
      views: Number(v.statistics?.viewCount) || 0,
    }));
  };

  return {
    name: "youtube",
    async isAvailable() {
      return Boolean(env.youtubeApiKey) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      seriesCache.length = 0;
      const targets =
        watch.length > 0
          ? watch.slice(0, TERM_CAP)
          : CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 2).map((t) => ({ term: t, category: c.category, geo: undefined })));
      for (const target of targets) {
        if (breaker.isOpen) return out;
        const termGeo = target.geo ?? geo ?? "US";
        try {
          const videos = await readTerm(target.term, termGeo);
          if (videos.length === 0) continue;
          const read = readShorts(videos);
          seriesCache.push(...shortsSeries(videos, target.term, termGeo));
          out.push({
            source: "youtube",
            term: target.term,
            category: target.category,
            geo: termGeo,
            metric_type: "shortform_views",
            value: read.views,
            delta_pct: read.deltaPct,
            window_days: Math.min(windowDays, 7),
            raw: {
              uploads: read.uploads,
              uploadsPrev: read.uploadsPrev,
              views: read.views,
              viewsPrev: read.viewsPrev,
              // The single Short doing the most work this week: the owner can
              // watch it and see the format that's landing.
              top: read.top ? { id: read.top.id, title: read.top.title, channel: read.top.channel, views: read.top.views } : null,
            },
          });
        } catch (err) {
          console.warn(`[signals:youtube] "${target.term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache;
    },
  };
}
