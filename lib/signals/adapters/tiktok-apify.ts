import { env } from "@/lib/env";

import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";
import { coreTerm } from "./trends-iot";

/**
 * TikTok, per term — the read the keyless Creative Center board cannot give.
 *
 * `tiktok-cc.ts` is capped at three national rows per industry query, and
 * every per-term surface TikTok owns answers `InvalidLogin` or `no
 * permission` without a signed web token (re-verified 2026-09-11). So the
 * only honest way to read TikTok for a specific business's terms is to pay
 * someone who already solved that, and this adapter is that seam: a
 * commercial Apify actor, key-gated on APIFY_TOKEN, unavailable and
 * therefore skipped when the token is absent.
 *
 * It is deliberately shaped like the YouTube read — same velocity-based
 * momentum, same engagement and duration facts, same corpus for the format
 * pass — so the two short-form sources say the same KIND of thing and the
 * insight layer does not need to learn a second vocabulary. TikTok gives two
 * things YouTube does not: shares and saves, which are the truest signals
 * that a video made someone act, and the author's follower count, which is
 * how you tell a format that works from an audience that was already there.
 *
 * Cost is per result, not per call, so coverage here is bounded by an
 * explicit term cap rather than a quota: every term read is money.
 */

const RUN_URL = "https://api.apify.com/v2/acts";
/** Overridable because actors get renamed and deprecated out from under you. */
const DEFAULT_ACTOR = "clockworks~tiktok-scraper";
const LOOKBACK_DAYS = 28;
const CURRENT_DAYS = 7;
const MAX_SHORT_SEC = 180;
const RESULTS_PER_TERM = 40;
const THIN_RESULTS = 5;
/** Every term is a paid run; the default is a floor, not a target. */
const DEFAULT_TERM_CAP = 25;

/** The subset of the actor's output this reads. Everything is optional —
 * actor schemas drift, and a renamed field must degrade to a missing number,
 * never throw mid-run. */
export interface ApifyTikTokItem {
  id?: string;
  text?: string;
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
  webVideoUrl?: string;
  videoMeta?: { duration?: number };
  authorMeta?: { name?: string; nickName?: string; fans?: number };
  hashtags?: { name?: string }[];
}

export interface TikTokPost {
  id: string;
  url: string;
  caption: string;
  publishedAt: string;
  author: string;
  authorFollowers: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  durationSec: number;
  hashtags: string[];
}

export interface TikTokCard {
  id: string;
  caption: string;
  author: string;
  durationSec: number;
  views: number;
  velocity: number;
  engagementPct: number | null;
  /** (shares + saves) / views — intent to act, not just to react. */
  actionPct: number | null;
  /** True when the author had a small following: the format carried it, not
   * the audience. */
  fromSmallAccount: boolean;
}

export interface TikTokRead {
  uploads: number;
  uploadsPrev: number;
  views: number;
  viewsPrev: number;
  deltaPct: number | null;
  engagementPct: number | null;
  actionPct: number | null;
  medianDurationSec: number | null;
  top: TikTokPost | null;
  breakout: TikTokPost | null;
  /** Hashtags the winning posts actually carry — what to tag yours with. */
  hashtags: string[];
  corpus: TikTokCard[];
}

/** Below this many followers a post's reach came from the format rather
 * than an existing audience — which is the only kind a local shop can copy. */
const SMALL_ACCOUNT_FOLLOWERS = 10_000;

export function toPosts(items: ApifyTikTokItem[]): TikTokPost[] {
  const out: TikTokPost[] = [];
  for (const i of items) {
    const publishedAt = i.createTimeISO ?? "";
    if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) continue;
    out.push({
      id: String(i.id ?? ""),
      url: i.webVideoUrl ?? "",
      // Captions carry the hook and the offer; they are also where spam puts
      // three hundred hashtags, so they are bounded like the Shorts ones.
      caption: (i.text ?? "").slice(0, 400),
      publishedAt,
      author: i.authorMeta?.nickName || i.authorMeta?.name || "",
      authorFollowers: Number(i.authorMeta?.fans) || 0,
      views: Number(i.playCount) || 0,
      likes: Number(i.diggCount) || 0,
      comments: Number(i.commentCount) || 0,
      shares: Number(i.shareCount) || 0,
      saves: Number(i.collectCount) || 0,
      durationSec: Number(i.videoMeta?.duration) || 0,
      hashtags: (i.hashtags ?? [])
        .map((h) => (h.name ?? "").toLowerCase())
        .filter((h) => h.length > 1),
    });
  }
  return out;
}

export function postVelocity(post: TikTokPost, now = new Date()): number {
  const ageHours = (now.getTime() - Date.parse(post.publishedAt)) / 3_600_000;
  if (!Number.isFinite(ageHours)) return 0;
  return post.views / Math.max(ageHours, 1);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Pure: the same split and the same age-normalized momentum the Shorts read
 * uses. See `youtube.ts` on why the delta is velocity and not raw views —
 * the sampling bias is identical here, because a scraper ordered by
 * relevance also surfaces what has had time to accumulate.
 */
export function readTikTok(posts: TikTokPost[], now = new Date()): TikTokRead {
  const cutoff = now.getTime() - CURRENT_DAYS * 86400_000;
  const floor = now.getTime() - LOOKBACK_DAYS * 86400_000;
  const baselineWeeks = (LOOKBACK_DAYS - CURRENT_DAYS) / 7;

  const current: TikTokPost[] = [];
  const baseline: TikTokPost[] = [];
  for (const p of posts) {
    const at = Date.parse(p.publishedAt);
    if (!Number.isFinite(at) || at < floor || at > now.getTime()) continue;
    if (p.durationSec > MAX_SHORT_SEC) continue;
    (at >= cutoff ? current : baseline).push(p);
  }

  const read: TikTokRead = {
    uploads: current.length,
    uploadsPrev: Math.round(baseline.length / baselineWeeks),
    views: current.reduce((s, p) => s + p.views, 0),
    viewsPrev: Math.round(baseline.reduce((s, p) => s + p.views, 0) / baselineWeeks),
    deltaPct: null,
    engagementPct: null,
    actionPct: null,
    medianDurationSec: median(current.map((p) => p.durationSec)),
    top: null,
    breakout: null,
    hashtags: [],
    corpus: [],
  };

  const curVel = median(current.map((p) => postVelocity(p, now)));
  const baseVel = median(baseline.map((p) => postVelocity(p, now)));
  if (curVel !== null && baseVel !== null && baseVel > 0) {
    read.deltaPct = Math.max(-100, Math.min(200, Math.round(((curVel - baseVel) / baseVel) * 100)));
  }

  if (read.views > 0) {
    const reactions = current.reduce((s, p) => s + p.likes + p.comments, 0);
    const actions = current.reduce((s, p) => s + p.shares + p.saves, 0);
    read.engagementPct = Number(((reactions / read.views) * 100).toFixed(2));
    read.actionPct = Number(((actions / read.views) * 100).toFixed(2));
  }

  for (const p of current) {
    if (!read.top || p.views > read.top.views) read.top = p;
    if (!read.breakout || postVelocity(p, now) > postVelocity(read.breakout, now)) read.breakout = p;
  }

  // Tags carried by more than one winning post — a convention, not one
  // account's habit.
  const tagCounts = new Map<string, number>();
  for (const p of current) {
    for (const tag of new Set(p.hashtags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  read.hashtags = [...tagCounts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 8);

  read.corpus = current
    .map((p) => ({
      id: p.id,
      caption: p.caption,
      author: p.author,
      durationSec: p.durationSec,
      views: p.views,
      velocity: Math.round(postVelocity(p, now)),
      engagementPct: p.views > 0 ? Number((((p.likes + p.comments) / p.views) * 100).toFixed(2)) : null,
      actionPct: p.views > 0 ? Number((((p.shares + p.saves) / p.views) * 100).toFixed(2)) : null,
      fromSmallAccount: p.authorFollowers > 0 && p.authorFollowers < SMALL_ACCOUNT_FOLLOWERS,
    }))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 12);

  return read;
}

export function tiktokSeries(posts: TikTokPost[], term: string, geo: string): RawSeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const p of posts) {
    const day = p.publishedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + p.views);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ term, geo, day, value }));
}

/** Apify TikTok actor — only when APIFY_TOKEN is present. */
export function createTiktokApifyAdapter(
  opts: { fetchText?: typeof fetchText; termCap?: number } = {},
): SignalAdapter {
  const doFetchText = opts.fetchText ?? fetchText;
  const breaker = new CircuitBreaker("tiktok_apify");
  const seriesCache: RawSeriesPoint[] = [];

  const runActor = async (term: string): Promise<TikTokPost[]> => {
    const actor = env.apifyTiktokActor || DEFAULT_ACTOR;
    // run-sync-get-dataset-items blocks until the run finishes and hands back
    // the items directly — no polling, and no dataset left behind to clean up.
    const body = JSON.stringify({
      searchQueries: [term],
      resultsPerPage: RESULTS_PER_TERM,
      oldestPostDateUnified: new Date(Date.now() - LOOKBACK_DAYS * 86400_000)
        .toISOString()
        .slice(0, 10),
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
    });
    const text = await doFetchText(
      `${RUN_URL}/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body, breaker },
    );
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? toPosts(parsed as ApifyTikTokItem[]) : [];
  };

  return {
    name: "tiktok_apify",
    async isAvailable() {
      return Boolean(env.apifyToken) && !breaker.isOpen;
    },
    async fetch({ geo, windowDays, watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      seriesCache.length = 0;
      // Only a business's own terms are worth paying for; the stock category
      // terms are already covered free by the Creative Center board.
      const targets = watch.filter((w) => w.geo).slice(0, opts.termCap ?? DEFAULT_TERM_CAP);
      for (const target of targets) {
        if (breaker.isOpen) return out;
        const termGeo = target.geo ?? geo ?? "US";
        try {
          let measuredTerm = target.term;
          let posts = await runActor(target.term);
          if (posts.length < THIN_RESULTS && (target.locality?.length ?? 0) > 0) {
            const widened = coreTerm(target.term, target.locality);
            if (widened !== target.term.toLowerCase()) {
              const wider = await runActor(widened);
              if (wider.length > posts.length) {
                posts = wider;
                measuredTerm = widened;
              }
            }
          }
          if (posts.length === 0) continue;
          const read = readTikTok(posts);
          if (read.uploads === 0) continue;
          seriesCache.push(...tiktokSeries(posts, target.term, termGeo));
          out.push({
            source: "tiktok",
            term: target.term,
            category: target.category,
            geo: termGeo,
            metric_type: "shortform_views",
            value: read.views,
            delta_pct: read.deltaPct,
            window_days: Math.min(windowDays, CURRENT_DAYS),
            raw: {
              platform: "tiktok",
              uploads: read.uploads,
              uploadsPrev: read.uploadsPrev,
              views: read.views,
              viewsPrev: read.viewsPrev,
              engagementPct: read.engagementPct,
              actionPct: read.actionPct,
              medianDurationSec: read.medianDurationSec,
              hashtags: read.hashtags,
              top: read.top
                ? { id: read.top.id, title: read.top.caption, channel: read.top.author, views: read.top.views, url: read.top.url }
                : null,
              breakout: read.breakout
                ? { id: read.breakout.id, title: read.breakout.caption, channel: read.breakout.author, views: read.breakout.views, url: read.breakout.url }
                : null,
              corpus: read.corpus,
              measuredTerm,
              adjusted: measuredTerm !== target.term,
              // This read is per-term and local, unlike the Creative Center
              // board — the insight layer must not frame it as national.
              perTerm: true,
              sampled: posts.length,
            },
          });
        } catch (err) {
          console.warn(`[signals:tiktok_apify] "${target.term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache;
    },
  };
}
