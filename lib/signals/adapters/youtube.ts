import { env } from "@/lib/env";

import { isLatinText } from "../ad-relevance";
import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter, WatchTerm } from "../types";
import { coreTerm } from "./trends-iot";

/**
 * YouTube Shorts — the short-form read for a business's own terms.
 *
 * Two earlier versions of this were too shallow to rank on. The first
 * counted how many videos came back from one search and called it
 * "video_volume": capped at the page size, so every busy term reported the
 * same 25, with no delta at all. The second fixed the units (views, not
 * supply) but still threw away everything else the API had already paid for
 * and compared one week against the single week before it.
 *
 * What an owner actually needs is not "views are up 40%" — it's which
 * FORMAT is working: how long the winning videos are, how hard they're
 * engaged with, who keeps making them, and which one to watch before
 * shooting their own. `videos.list` returns all of that for the same 1 unit
 * whether you ask for one part or four, so this reads snippet,
 * contentDetails and statistics and keeps the lot. The format-naming pass
 * runs later, per business, over the handful of terms that actually rank —
 * mining 60 terms a night would cost an AI call per term for insight nobody
 * reads.
 *
 * Two things here are about not lying with the numbers:
 *
 * 1. `videoDuration=short` is the API's <4min bucket, which is not a Short.
 *    Duration is checked against MAX_SHORT_SEC so the read is really Shorts.
 * 2. Week-over-week on raw views is biased by construction: a search ordered
 *    by view count over a 28-day window returns mostly OLDER videos, because
 *    they have had longer to accumulate. Comparing this week's total against
 *    that makes every term look like it's falling. So momentum is measured
 *    on VELOCITY — views per hour since publish — which is age-normalized,
 *    and the two windows become comparable. Raw views are still reported as
 *    the volume, they're just not what the delta is computed from.
 *
 * Quota: search.list is 100 units, videos.list is 1, against a free
 * 10,000/day. That is the binding constraint on coverage, so reads are
 * tiered — a business's own terms get the deep two-search read, stock
 * category terms get the single survey search — and every call is drawn
 * against an explicit unit budget that degrades rather than 403s.
 */

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

/** One reporting week plus three of baseline, so a quiet week has something
 * stable to be quiet against. */
const LOOKBACK_DAYS = 28;
const CURRENT_DAYS = 7;
/** Shorts are vertical video up to 3 minutes; the API's "short" is <4. */
const MAX_SHORT_SEC = 180;
/** Below this many videos a local term hasn't been measured, it's been
 * missed — widen to the core service the way the Trends read does. */
const THIN_RESULTS = 5;

const SEARCH_UNITS = 100;
const VIDEOS_UNITS = 1;
/** Free tier is 10,000/day; leave headroom for a re-run or a manual probe. */
const DEFAULT_UNIT_BUDGET = 9_000;
const TERM_CAP = 60;

interface YtSearchResponse {
  items?: { id?: { videoId?: string } }[];
}
interface YtVideosResponse {
  items?: {
    id?: string;
    snippet?: {
      publishedAt?: string;
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

export interface ShortVideo {
  id: string;
  publishedAt: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
}

/** The compact per-video record the format-naming pass reads. Bounded on
 * purpose: this rides along in signals.raw, which is a database column. */
export interface ShortCard {
  id: string;
  title: string;
  channel: string;
  durationSec: number;
  views: number;
  /** Views per hour since publish — how hard it broke, not how long it's sat. */
  velocity: number;
  /** (likes + comments) / views, as a percentage. */
  engagementPct: number | null;
}

export interface ShortsRead {
  /** Shorts published in the last 7 days, and the weekly average across the
   * three baseline weeks before them. */
  uploads: number;
  uploadsPrev: number;
  /** Views those Shorts have pulled — the attention, not the supply. */
  views: number;
  viewsPrev: number;
  /** Week-over-week change in median VELOCITY (see the file header on why
   * this is not computed from raw views). Null when there's no baseline. */
  deltaPct: number | null;
  /** View-weighted (likes + comments) / views this week, as a percentage —
   * whether the format earns a reaction or just autoplays past. */
  engagementPct: number | null;
  /** Median length of this week's Shorts: the single most copyable fact
   * about a format. */
  medianDurationSec: number | null;
  /** Most views this week — the one to watch before shooting yours. */
  top: ShortVideo | null;
  /** Fastest-climbing this week, which is often not the same video: the top
   * video can be a big channel's floor, the breakout is the format working
   * for someone with no audience. */
  breakout: ShortVideo | null;
  /** Channels that posted more than once on this in the last 7 days — a
   * format being worked, not a one-off. */
  repeatChannels: string[];
  /** This week's Shorts, richest first, for the format-naming pass. */
  corpus: ShortCard[];
}

/** ISO 8601 duration ("PT1M30S") → seconds. Shorts never reach hours, but
 * the API emits the H field and a missing one must not read as zero. */
export function parseIsoDuration(iso: string | undefined): number {
  const m = /^P(?:([\d.]+)D)?T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (
    (Number(d) || 0) * 86400 + (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0)
  );
}

/** Views per hour since publish. Floored at one hour so a video posted
 * minutes ago can't divide its way to a millions-per-hour breakout. */
export function velocity(video: ShortVideo, now = new Date()): number {
  const ageHours = (now.getTime() - Date.parse(video.publishedAt)) / 3_600_000;
  if (!Number.isFinite(ageHours)) return 0;
  return video.views / Math.max(ageHours, 1);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function toCard(v: ShortVideo, now: Date): ShortCard {
  return {
    id: v.id,
    title: v.title,
    channel: v.channel,
    durationSec: v.durationSec,
    views: v.views,
    velocity: Math.round(velocity(v, now)),
    engagementPct: v.views > 0 ? Number((((v.likes + v.comments) / v.views) * 100).toFixed(2)) : null,
  };
}

/**
 * Pure: split the lookback into this week and the baseline weeks before it,
 * and read the format out of this week.
 */
export function readShorts(videos: ShortVideo[], now = new Date()): ShortsRead {
  const cutoff = now.getTime() - CURRENT_DAYS * 86400_000;
  const floor = now.getTime() - LOOKBACK_DAYS * 86400_000;
  const baselineWeeks = (LOOKBACK_DAYS - CURRENT_DAYS) / 7;

  const read: ShortsRead = {
    uploads: 0,
    uploadsPrev: 0,
    views: 0,
    viewsPrev: 0,
    deltaPct: null,
    engagementPct: null,
    medianDurationSec: null,
    top: null,
    breakout: null,
    repeatChannels: [],
    corpus: [],
  };

  const current: ShortVideo[] = [];
  const baseline: ShortVideo[] = [];
  for (const v of videos) {
    const at = Date.parse(v.publishedAt);
    if (!Number.isFinite(at) || at < floor || at > now.getTime()) continue;
    if (v.durationSec > MAX_SHORT_SEC) continue;
    (at >= cutoff ? current : baseline).push(v);
  }

  read.uploads = current.length;
  read.views = current.reduce((sum, v) => sum + v.views, 0);
  read.uploadsPrev = Math.round(baseline.length / baselineWeeks);
  read.viewsPrev = Math.round(baseline.reduce((sum, v) => sum + v.views, 0) / baselineWeeks);

  // Age-normalized momentum. A week with no baseline is "no read", not
  // "up infinity" — the same rule the TikTok curve follows.
  const curVel = median(current.map((v) => velocity(v, now)));
  const baseVel = median(baseline.map((v) => velocity(v, now)));
  if (curVel !== null && baseVel !== null && baseVel > 0) {
    read.deltaPct = Math.max(-100, Math.min(200, Math.round(((curVel - baseVel) / baseVel) * 100)));
  }

  if (read.views > 0) {
    const reactions = current.reduce((sum, v) => sum + v.likes + v.comments, 0);
    read.engagementPct = Number(((reactions / read.views) * 100).toFixed(2));
  }
  read.medianDurationSec = median(current.map((v) => v.durationSec));

  // Which single video the owner is told to watch is the most consequential
  // thing in this read, and raw views pick the wrong one. Live validation on
  // "cold plunge" surfaced a 2M-view clip at 0.19% engagement — a video the
  // algorithm pushed, not a format that earned anything, and useless as an
  // instruction to go and shoot something. So the two picks are drawn only
  // from videos that beat the week's median engagement: the question is
  // which format WORKED, and a video nobody reacts to has not answered it.
  // Aggregate views still count everything; this gates the recommendation
  // only, and falls back to the full set when the sample is too small to
  // have a meaningful median.
  const rates = current
    .filter((v) => v.views > 0)
    .map((v) => (v.likes + v.comments) / v.views);
  const bar = current.length >= 4 ? (median(rates) ?? 0) : 0;
  const earned = current.filter(
    (v) => v.views > 0 && (v.likes + v.comments) / v.views >= bar,
  );
  const pickFrom = earned.length > 0 ? earned : current;
  for (const v of pickFrom) {
    if (!read.top || v.views > read.top.views) read.top = v;
    if (!read.breakout || velocity(v, now) > velocity(read.breakout, now)) read.breakout = v;
  }

  const byChannel = new Map<string, number>();
  for (const v of current) {
    if (!v.channel) continue;
    byChannel.set(v.channel, (byChannel.get(v.channel) ?? 0) + 1);
  }
  read.repeatChannels = [...byChannel.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5);

  read.corpus = current
    .map((v) => toCard(v, now))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 12);

  return read;
}

/** Pure: the daily view-weight line, so the tracker can draw the window. */
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

/** A spend counter the adapter draws every call against, so a long run
 * degrades to fewer terms instead of a wall of 403 quotaExceeded. */
class UnitBudget {
  private spent = 0;
  constructor(private readonly total: number) {}
  get remaining(): number {
    return Math.max(this.total - this.spent, 0);
  }
  canAfford(units: number): boolean {
    return this.remaining >= units;
  }
  spend(units: number): void {
    this.spent += units;
  }
}

/** YouTube Data API v3 — only when YOUTUBE_API_KEY is present. */
export function createYoutubeAdapter(
  opts: { fetchJson?: typeof fetchJson; unitBudget?: number; termCap?: number } = {},
): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("youtube");
  // fetch() and fetchSeries() run back to back over the same terms; reading
  // the API twice would double a cost that is already the run's most
  // expensive.
  const seriesCache: RawSeriesPoint[] = [];

  const search = async (params: Record<string, string>, budget: UnitBudget): Promise<string[]> => {
    if (!budget.canAfford(SEARCH_UNITS)) return [];
    budget.spend(SEARCH_UNITS);
    const qs = new URLSearchParams({
      part: "id",
      type: "video",
      videoDuration: "short",
      maxResults: "50",
      relevanceLanguage: "en",
      key: env.youtubeApiKey,
      ...params,
    });
    const res = await doFetchJson<YtSearchResponse>(`${SEARCH_URL}?${qs}`, { breaker });
    return (res.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
  };

  const hydrate = async (ids: string[], budget: UnitBudget): Promise<ShortVideo[]> => {
    const out: ShortVideo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      if (!budget.canAfford(VIDEOS_UNITS)) break;
      budget.spend(VIDEOS_UNITS);
      const res = await doFetchJson<YtVideosResponse>(
        `${VIDEOS_URL}?part=snippet,contentDetails,statistics&id=${ids.slice(i, i + 50).join(",")}` +
          `&key=${env.youtubeApiKey}`,
        { breaker },
      );
      for (const v of res.items ?? []) {
        out.push({
          id: v.id ?? "",
          publishedAt: v.snippet?.publishedAt ?? "",
          title: v.snippet?.title ?? "",
          // Enough to read the hook and the on-screen offer; full descriptions
          // are link dumps and would bloat every stored row.
          description: (v.snippet?.description ?? "").slice(0, 400),
          channel: v.snippet?.channelTitle ?? "",
          channelId: v.snippet?.channelId ?? "",
          views: Number(v.statistics?.viewCount) || 0,
          likes: Number(v.statistics?.likeCount) || 0,
          comments: Number(v.statistics?.commentCount) || 0,
          durationSec: parseIsoDuration(v.contentDetails?.duration),
        });
      }
    }
    return out;
  };

  /**
   * Both windows are sampled the SAME way — top by view count, each bounded
   * to its own window — so the two are comparable.
   *
   * The first version searched 28 days ordered by date for the sample and
   * let `readShorts` split it. Live validation killed that: for any term
   * busy enough to fill 50 results, the 50 most RECENT videos are all from
   * the last day or two, so the baseline window came back empty and the
   * momentum read — 35% of the score — silently fell back to neutral on
   * precisely the terms that matter most. "cold plunge" returned 100 videos
   * and a baseline of zero; only a niche term like "contrast therapy studio"
   * ever filled both halves.
   *
   * So the baseline window is now asked for directly with publishedBefore,
   * at the same cost (two searches), and survey terms — which get one
   * search — report volume with no momentum rather than a fabricated one.
   */
  const readTerm = async (
    term: string,
    geo: string,
    deep: boolean,
    budget: UnitBudget,
  ): Promise<ShortVideo[]> => {
    const regionCode = geo.slice(0, 2) || "US";
    const now = Date.now();
    const iso = (daysAgo: number) => new Date(now - daysAgo * 86400_000).toISOString();
    const ids = new Set(
      await search(
        { q: term, order: "viewCount", regionCode, publishedAfter: iso(CURRENT_DAYS) },
        budget,
      ),
    );
    if (deep) {
      for (const id of await search(
        {
          q: term,
          order: "viewCount",
          regionCode,
          publishedAfter: iso(LOOKBACK_DAYS),
          publishedBefore: iso(CURRENT_DAYS),
        },
        budget,
      )) {
        ids.add(id);
      }
    }
    if (ids.size === 0) return [];
    const videos = await hydrate([...ids], budget);
    // A US shop cannot act on a video it cannot read. Live validation on
    // "cold plunge" returned Hindi, French and Cyrillic entertainment clips
    // — including a 2M-view one that became "the video to watch before you
    // shoot yours". regionCode and relevanceLanguage do not filter these
    // out, so the title has to. Same test the ad read uses.
    return videos.filter((v) => isLatinText(v.title));
  };

  return {
    name: "youtube",
    async isAvailable() {
      return Boolean(env.youtubeApiKey) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      seriesCache.length = 0;
      const budget = new UnitBudget(opts.unitBudget ?? DEFAULT_UNIT_BUDGET);
      const cap = opts.termCap ?? TERM_CAP;

      // A business's own watch terms are the product; the stock category
      // terms are the floor. Business terms carry a geo, so that is the
      // split — and they are read first, while there is budget for the
      // two-search deep read.
      // Prioritise BEFORE capping. The ingest watchlist puts the stock
      // category terms in first and every business's own terms after them,
      // so slicing before this sort spends the whole budget on generic
      // terms and drops the ones the product exists to read.
      const targets: (WatchTerm & { deep: boolean })[] = (
        watch.length > 0
          ? watch.map((w) => ({ ...w, deep: Boolean(w.geo) }))
          : CATEGORY_CONFIGS.flatMap((c) =>
              c.watchTerms.slice(0, 2).map((t) => ({ term: t, category: c.category, deep: false })),
            )
      )
        .sort((a, b) => Number(b.deep) - Number(a.deep))
        .slice(0, cap);

      for (const target of targets) {
        if (breaker.isOpen) return out;
        // The cheapest possible read still costs a search plus a hydrate.
        if (!budget.canAfford(SEARCH_UNITS + VIDEOS_UNITS)) {
          console.warn(`[signals:youtube] unit budget spent — ${out.length} terms read`);
          break;
        }
        const termGeo = target.geo ?? geo ?? "US";
        // Deep reads are only worth their second search while there is room
        // for one; past that the remaining terms degrade to survey reads.
        const deep = target.deep && budget.canAfford(SEARCH_UNITS * 2 + VIDEOS_UNITS * 2);
        try {
          // No-fail ladder, the same shape as the Trends read: a hyper-local
          // term ("cold plunge chapel hill") has no Shorts at all, and
          // reporting nothing is worse than reporting the core service and
          // saying so. What was actually measured travels with the number.
          let measuredTerm = target.term;
          let videos = await readTerm(target.term, termGeo, deep, budget);
          if (videos.length < THIN_RESULTS && (target.locality?.length ?? 0) > 0) {
            const widened = coreTerm(target.term, target.locality);
            if (widened !== target.term.toLowerCase() && budget.canAfford(SEARCH_UNITS + VIDEOS_UNITS)) {
              const wider = await readTerm(widened, termGeo, deep, budget);
              if (wider.length > videos.length) {
                videos = wider;
                measuredTerm = widened;
              }
            }
          }
          if (videos.length === 0) continue;

          const read = readShorts(videos);
          if (read.uploads === 0) continue;
          // Series stays keyed to the watch term so charts read continuously
          // even when the measured term was widened.
          seriesCache.push(...shortsSeries(videos, target.term, termGeo));
          out.push({
            source: "youtube",
            term: target.term,
            category: target.category,
            geo: termGeo,
            metric_type: "shortform_views",
            value: read.views,
            delta_pct: read.deltaPct,
            window_days: Math.min(windowDays, CURRENT_DAYS),
            raw: {
              uploads: read.uploads,
              uploadsPrev: read.uploadsPrev,
              views: read.views,
              viewsPrev: read.viewsPrev,
              engagementPct: read.engagementPct,
              medianDurationSec: read.medianDurationSec,
              repeatChannels: read.repeatChannels,
              // The single Short doing the most work this week, and the one
              // climbing fastest — the owner can watch both and see the
              // format that's landing.
              top: read.top
                ? { id: read.top.id, title: read.top.title, channel: read.top.channel, views: read.top.views, durationSec: read.top.durationSec }
                : null,
              breakout: read.breakout
                ? { id: read.breakout.id, title: read.breakout.title, channel: read.breakout.channel, views: read.breakout.views, durationSec: read.breakout.durationSec }
                : null,
              // What the per-business format pass reads later.
              corpus: read.corpus,
              measuredTerm,
              adjusted: measuredTerm !== target.term,
              deep,
              sampled: videos.length,
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
