import { env } from "@/lib/env";

import { CircuitBreaker, fetchJson, HttpError } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";
import { coreTerm } from "./trends-iot";

/**
 * X — what people are writing about a term, and how far it travelled.
 *
 * A post on X is not a video impression. Somebody typed it, which is rarer
 * and more deliberate than being shown a Reel, so it carries more intent per
 * unit and is weighted accordingly in lib/demand/points.ts. What it adds to
 * the composite that short-form cannot: the language people use unprompted,
 * and whether a thing is being discussed or merely watched.
 *
 * Key-gated on X_BEARER_TOKEN and unavailable without it. There is no
 * keyless path — X retired free read access, and the recent-search endpoint
 * this uses is the cheapest one that answers "how much is this being talked
 * about this week" at all. Access is a paid tier; the adapter degrades to
 * skipped rather than failing a run, exactly like the Apify seam.
 *
 * Quota is the binding constraint, as it is on YouTube: recent search is
 * capped per month on every tier, so reads are bounded by an explicit term
 * cap and only a business's own watch terms are spent on.
 */

const SEARCH_URL = "https://api.x.com/2/tweets/counts/recent";
const RECENT_URL = "https://api.x.com/2/tweets/search/recent";
/** Recent search only reaches back seven days on any tier. */
const WINDOW_DAYS = 7;
const DEFAULT_TERM_CAP = 25;
const THIN_POSTS = 3;

interface XCountsResponse {
  data?: { start: string; end: string; tweet_count: number }[];
  meta?: { total_tweet_count?: number };
}
interface XRecentResponse {
  data?: {
    id?: string;
    text?: string;
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
    };
  }[];
}

export interface XRead {
  /** Posts mentioning the term in the last seven days. */
  posts: number;
  /** The same count for the seven days before, when the window reaches. */
  postsPrev: number;
  deltaPct: number | null;
  /** Daily counts, for the demand line. */
  daily: { day: string; count: number }[];
  /** Engagement on the sample — how far the talk travelled. */
  reactions: number;
  /** The post doing the most work, for the proof link. */
  top: { id: string; text: string; reactions: number } | null;
}

/**
 * Pure: counts by day into a week-over-week read.
 *
 * X returns the window as daily buckets. Seven days is all recent search
 * gives, so "last week" is the first half of that window against the
 * second — a narrower comparison than the Shorts read gets, and the delta
 * is null rather than invented when the window is too short to halve.
 */
export function readX(
  buckets: { start: string; tweet_count: number }[],
  sample: XRecentResponse["data"] = [],
): XRead {
  const daily = [...buckets]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => ({ day: b.start.slice(0, 10), count: b.tweet_count }));

  const read: XRead = {
    posts: 0,
    postsPrev: 0,
    deltaPct: null,
    daily,
    reactions: 0,
    top: null,
  };
  if (daily.length === 0) return read;

  const half = Math.floor(daily.length / 2);
  read.posts = daily.slice(half).reduce((s, d) => s + d.count, 0);
  read.postsPrev = daily.slice(0, half).reduce((s, d) => s + d.count, 0);
  if (half > 0 && read.postsPrev > 0) {
    read.deltaPct = Math.max(
      -100,
      Math.min(200, Math.round(((read.posts - read.postsPrev) / read.postsPrev) * 100)),
    );
  }

  for (const post of sample ?? []) {
    const m = post.public_metrics ?? {};
    const reactions =
      (m.retweet_count ?? 0) + (m.reply_count ?? 0) + (m.like_count ?? 0) + (m.quote_count ?? 0);
    read.reactions += reactions;
    if (post.id && (!read.top || reactions > read.top.reactions)) {
      read.top = { id: post.id, text: (post.text ?? "").slice(0, 200), reactions };
    }
  }
  return read;
}

/** Pure: the daily post line for the tracker. */
export function xSeries(read: XRead, term: string, geo: string): RawSeriesPoint[] {
  return read.daily.map((d) => ({ term, geo, day: d.day, value: d.count }));
}

/** X recent search — only when X_BEARER_TOKEN is present. */
export function createXAdapter(
  opts: { fetchJson?: typeof fetchJson; termCap?: number } = {},
): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("x");
  const seriesCache: RawSeriesPoint[] = [];

  const auth = { authorization: `Bearer ${env.xBearerToken}` };

  const readTerm = async (term: string): Promise<XRead | null> => {
    // Quoted so a multi-word term is a phrase, and stripped of the noise
    // that makes a local read meaningless: retweets duplicate one post, and
    // links are usually somebody's marketing rather than a mention.
    const query = `"${term.replace(/"/g, "")}" -is:retweet lang:en`;
    const counts = await doFetchJson<XCountsResponse>(
      `${SEARCH_URL}?query=${encodeURIComponent(query)}&granularity=day`,
      { headers: auth, breaker },
    );
    const buckets = counts.data ?? [];
    if (buckets.length === 0) return null;
    let sample: XRecentResponse["data"] = [];
    try {
      const recent = await doFetchJson<XRecentResponse>(
        `${RECENT_URL}?query=${encodeURIComponent(query)}&max_results=25&tweet.fields=public_metrics`,
        { headers: auth, breaker },
      );
      sample = recent.data ?? [];
    } catch {
      // The counts are the signal; the sample is colour. A failed sample
      // must not lose the read.
    }
    return readX(buckets, sample);
  };

  return {
    name: "x",
    async isAvailable() {
      return Boolean(env.xBearerToken) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      seriesCache.length = 0;
      // A business's own terms only: the stock category terms are covered
      // free elsewhere and every read here is metered.
      const targets = watch.filter((w) => w.geo).slice(0, opts.termCap ?? DEFAULT_TERM_CAP);

      for (const target of targets) {
        if (breaker.isOpen) return out;
        const termGeo = target.geo ?? geo ?? "US";
        try {
          let measuredTerm = target.term;
          let read = await readTerm(target.term);
          // The same widen-and-disclose ladder the other adapters use: a
          // hyper-local phrase is not discussed on X by name.
          if ((read?.posts ?? 0) < THIN_POSTS && (target.locality?.length ?? 0) > 0) {
            // Strict: X measures a live conversation, so a widen that
            // guesses at the trailing word reads a different subject
            // confidently rather than reading this one thinly.
            const widened = coreTerm(target.term, target.locality, { strict: true });
            if (widened !== target.term.toLowerCase()) {
              const wider = await readTerm(widened);
              if ((wider?.posts ?? 0) > (read?.posts ?? 0)) {
                read = wider;
                measuredTerm = widened;
              }
            }
          }
          if (!read || read.posts === 0) continue;
          seriesCache.push(...xSeries(read, target.term, termGeo));
          out.push({
            source: "x",
            term: target.term,
            category: target.category,
            geo: termGeo,
            metric_type: "posts",
            value: read.posts,
            delta_pct: read.deltaPct,
            window_days: Math.min(windowDays, WINDOW_DAYS),
            raw: {
              // This read was NOT taken in the business's state. X recent search takes no geo filter at all.
              // The signal keeps termGeo so series and dedupe stay keyed to
              // the watch term, but the demand formula must weight it for
              // where it was actually measured — otherwise a global count
              // gets a local multiplier.
              measuredGeo: "US",
              posts: read.posts,
              postsPrev: read.postsPrev,
              reactions: read.reactions,
              top: read.top,
              measuredTerm,
              adjusted: measuredTerm !== target.term,
            },
          });
        } catch (err) {
          // 401/402/403 are entitlement, not a bad term: the key is wrong,
          // the plan has no credits, or the tier does not include search.
          // Retrying the next 24 terms cannot change that, so stop the
          // adapter for the run instead of logging the same refusal 25
          // times. Verified live: a free-tier token answers every search
          // endpoint with 402 "credits depleted".
          if (err instanceof HttpError && [401, 402, 403].includes(err.status)) {
            console.warn(
              `[signals:x] ${err.status} from X — the key has no search entitlement; skipping the rest of this run.`,
            );
            return out;
          }
          console.warn(`[signals:x] "${target.term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache;
    },
  };
}
