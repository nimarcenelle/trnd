import { env } from "@/lib/env";

import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

interface YtSearchResponse {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; publishedAt?: string } }[];
}

/** YouTube Data API v3 — only when YOUTUBE_API_KEY is present. */
export function createYoutubeAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("youtube");
  return {
    name: "youtube",
    async isAvailable() {
      return Boolean(env.youtubeApiKey) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      const publishedAfter = new Date(Date.now() - windowDays * 86400_000).toISOString();
      const targets =
        watch.length > 0
          ? watch.slice(0, 24)
          : CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 2).map((t) => ({ term: t, category: c.category })));
      for (const { term, category } of targets) {
        if (breaker.isOpen) return out;
        try {
          const data = await fetchJson<YtSearchResponse>(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(
              term,
            )}&publishedAfter=${encodeURIComponent(publishedAfter)}&key=${env.youtubeApiKey}`,
            { breaker },
          );
          const count = data.items?.length ?? 0;
          out.push({
            source: "youtube",
            term,
            category,
            geo: geo || "US",
            metric_type: "video_volume",
            value: count,
            delta_pct: null,
            window_days: windowDays,
            raw: { videos: count },
          });
        } catch (err) {
          console.warn(`[signals:youtube] "${term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
