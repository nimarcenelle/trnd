import { env } from "@/lib/env";

import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

interface RedditPost {
  data: {
    title: string;
    score: number;
    num_comments: number;
    created_utc: number;
    subreddit: string;
    permalink: string;
  };
}
export interface RedditListing {
  data?: { children?: RedditPost[] };
}

/** Pure ranker — unit-tested against a fixture. */
export function topRedditSignals(
  listing: RedditListing,
  category: string,
  geo: string,
  perSub = 3,
): RawSignal[] {
  const posts = listing.data?.children ?? [];
  const now = Date.now() / 1000;
  return posts
    .filter((p) => p.data?.title)
    .map((p) => {
      const ageHours = Math.max(1, (now - p.data.created_utc) / 3600);
      const velocity = p.data.score / ageHours;
      return { post: p, velocity };
    })
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, perSub)
    .map(({ post, velocity }) => ({
      source: "reddit" as const,
      term: post.data.title.slice(0, 140),
      category,
      geo,
      metric_type: "conversation",
      value: post.data.score,
      // Upvote velocity as a rough rise proxy, capped to keep scoring sane.
      delta_pct: Math.min(100, Math.round(velocity)),
      window_days: 7,
      raw: {
        subreddit: post.data.subreddit,
        score: post.data.score,
        num_comments: post.data.num_comments,
        permalink: post.data.permalink,
      },
    }));
}

/**
 * Reddit public JSON — no key needed; a descriptive User-Agent is mandatory
 * or you get 429'd.
 */
export function createRedditAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("reddit");
  return {
    name: "reddit",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ geo, subreddits }: AdapterFetchInput): Promise<RawSignal[]> {
      // Snapshot-widened list when ingest provides one (stock categories plus
      // each business's own communities); stock configs otherwise.
      const subs =
        subreddits && subreddits.length > 0
          ? subreddits
          : CATEGORY_CONFIGS.flatMap((cfg) => cfg.subreddits.map((name) => ({ name, category: cfg.category })));
      const out: RawSignal[] = [];
      for (const { name, category } of subs) {
        if (breaker.isOpen) return out; // partial results beat a dead run
        try {
          const listing = await fetchJson<RedditListing>(
            `https://www.reddit.com/r/${name}/top.json?t=week&limit=100`,
            { breaker, headers: { "User-Agent": env.redditUserAgent } },
          );
          out.push(...topRedditSignals(listing, category, geo || "US"));
        } catch (err) {
          console.warn(`[signals:reddit] r/${name} failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
