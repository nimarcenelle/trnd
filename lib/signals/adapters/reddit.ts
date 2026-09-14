import { env, isRedditConfigured } from "@/lib/env";

import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

/**
 * Reddit: what people say to each other about a term, in the communities
 * the brand's customer hangs out in.
 *
 * Two reads. The community read is the stock one: the week's top posts per
 * subreddit, ranked by upvote velocity. The term read is new and is the one
 * the Customer signal's intent needs: a search for each of the brand's own
 * terms across all of Reddit, the month's most relevant posts, title and
 * the first lines of the body, so "why is my hair falling out since I
 * moved" reaches the classifier whichever subreddit it was asked in.
 *
 * The public JSON endpoints answer 403 from cloud IPs (and, since the
 * audit, from a laptop too): the adapter had written no row in fourteen
 * days. The official API is free at 100 requests a minute with an OAuth
 * app: a client id and secret, exchanged for a bearer token here with the
 * client-credentials grant. Key-gated on REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET; without them the public path is still tried, and
 * fails as quietly as it always did.
 */

interface RedditPost {
  data: {
    title: string;
    selftext?: string;
    score: number;
    num_comments: number;
    created_utc: number;
    subreddit: string;
    permalink: string;
    over_18?: boolean;
  };
}
export interface RedditListing {
  data?: { children?: RedditPost[] };
}

const PUBLIC = "https://www.reddit.com";
const OAUTH = "https://oauth.reddit.com";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
/** Terms searched per run, and posts kept per term. */
export const MAX_SEARCH_TERMS = 15;
export const POSTS_PER_TERM = 6;
const BODY_CHARS = 240;

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
 * Pure: a term's search results into conversation rows. The row's term is
 * the post title (what the Customer read classifies) and the watched term
 * travels in raw, so the intent read can find every post on it. Adult
 * posts are dropped: a US brand cannot act on them.
 */
export function termSearchSignals(
  listing: RedditListing,
  term: string,
  category: string,
  geo: string,
  perTerm = POSTS_PER_TERM,
): RawSignal[] {
  const posts = (listing.data?.children ?? []).filter((p) => p.data?.title && !p.data.over_18);
  return posts.slice(0, perTerm).map((p) => ({
    source: "reddit" as const,
    term: p.data.title.slice(0, 140),
    category,
    geo,
    metric_type: "conversation",
    value: p.data.score,
    delta_pct: null,
    window_days: 30,
    raw: {
      subreddit: p.data.subreddit,
      score: p.data.score,
      num_comments: p.data.num_comments,
      permalink: p.data.permalink,
      searched_for: term,
      body: (p.data.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, BODY_CHARS),
    },
  }));
}

/** The client-credentials token, cached for its lifetime. */
let token: { value: string; expiresAt: number } | null = null;

async function bearer(): Promise<string | null> {
  if (!isRedditConfigured) return null;
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${env.redditClientId}:${env.redditClientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": env.redditUserAgent,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`reddit token ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("reddit token missing");
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return token.value;
}

/**
 * Reddit — the official API with an app, the public JSON without one. A
 * descriptive User-Agent is mandatory either way.
 */
export function createRedditAdapter(opts: { fetchJson?: typeof fetchJson } = {}): SignalAdapter {
  const breaker = new CircuitBreaker("reddit");
  const doFetchJson = opts.fetchJson ?? fetchJson;

  const get = async <T>(path: string): Promise<T> => {
    const auth = await bearer().catch((err: Error) => {
      console.warn("[signals:reddit] token failed, falling back to the public endpoint:", err.message);
      return null;
    });
    const base = auth ? OAUTH : PUBLIC;
    return doFetchJson<T>(`${base}${path}`, {
      breaker,
      headers: { "User-Agent": env.redditUserAgent, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    });
  };

  return {
    name: "reddit",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ geo, subreddits, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      // The brand's own terms, searched everywhere: the read the intent
      // classifier lives on.
      const terms = watch.filter((w) => w.geo).slice(0, MAX_SEARCH_TERMS);
      for (const { term, category } of terms) {
        if (breaker.isOpen) return out;
        try {
          const q = encodeURIComponent(`"${term.replace(/"/g, "")}"`);
          const listing = await get<RedditListing>(`/search.json?q=${q}&sort=relevance&t=month&limit=${POSTS_PER_TERM * 2}&raw_json=1`);
          out.push(...termSearchSignals(listing, term, category, geo || "US"));
        } catch (err) {
          console.warn(`[signals:reddit] search "${term}" failed:`, (err as Error).message);
        }
      }
      // Snapshot-widened list when ingest provides one (stock categories plus
      // each business's own communities); stock configs otherwise.
      const subs = subreddits ?? CATEGORY_CONFIGS.flatMap((cfg) => cfg.subreddits.map((name) => ({ name, category: cfg.category })));
      for (const { name, category } of subs) {
        if (breaker.isOpen) return out; // partial results beat a dead run
        try {
          const listing = await get<RedditListing>(`/r/${name}/top.json?t=week&limit=100&raw_json=1`);
          out.push(...topRedditSignals(listing, category, geo || "US"));
        } catch (err) {
          console.warn(`[signals:reddit] r/${name} failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
