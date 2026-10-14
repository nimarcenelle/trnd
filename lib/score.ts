import type { Ad, AdEngagement, Platform, ScoreParts, SocialPost } from "@/lib/db/types";
import { daysRunning } from "@/lib/diff";

/**
 * The conversion score: a 0-100 heuristic for how well an ad has worked for
 * the company running it. Meta publishes no spend or results for commercial
 * ads, so it blends the signals we can see:
 *
 *   longevity   how long it has run (or ran). Companies stop paying for ads that don't convert.
 *   engagement  likes, comments and shares on the organic post the ad also runs as, against the
 *               company's typical post. Only for ads we can match to a post.
 *   reach       its rank when the Ad Library sorts the Page's ads by impressions.
 *   repetition  how many versions of it are running.
 *   sentiment   what commenters on that post say.
 *
 * Longevity and engagement lead. A missing signal drops out and the rest are
 * re-weighted, and the confidence says how much there was to go on.
 */

export const WEIGHTS = { longevity: 0.35, engagement: 0.35, reach: 0.15, repetition: 0.1, sentiment: 0.05 } as const;

/** 7 days → 0.42, 30 → 0.72, 60 → 0.86, 120+ → 1. */
export function longevityPart(days: number | null): number | null {
  if (days === null || days < 0) return null;
  return Math.min(1, Math.log1p(days) / Math.log1p(120));
}

/** Rank 0 of 20 → 1, last → 0. Too few ads read to rank: null. */
export function reachPart(rank: number | null | undefined, total: number | null | undefined): number | null {
  if (rank === null || rank === undefined || !total || total < 3) return null;
  return 1 - Math.min(rank, total - 1) / (total - 1);
}

/** 1 version → 0, 3 → 0.53, 8+ → 1. */
export function repetitionPart(versions: number): number {
  return Math.min(1, Math.log(Math.max(1, versions)) / Math.log(8));
}

/** Weighted interactions: a share says more than a comment, a comment more than a like. */
export function interactions(p: { likes: number | null; comments: number | null; shares?: number | null }): number {
  return (p.likes ?? 0) + 2 * (p.comments ?? 0) + 3 * (p.shares ?? 0);
}

/** Against the company's median post: at the median → 0.5, 3x → 0.75, 9x → 0.9. */
export function engagementPart(e: AdEngagement | null | undefined): number | null {
  if (!e || !e.baseline) return null;
  const ratio = interactions(e) / e.baseline;
  return ratio / (ratio + 1);
}

export function median(xs: number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const STOP = new Set(
  "the a an and or but for to of in on at by with from your you our we it its this that is are be was were have has not no all get just more now new can will".split(" "),
);
export function words(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9$%]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** How much of the shorter text the other one shares, 0-1, and how many words. */
export function overlap(a: Set<string>, b: Set<string>): { ratio: number; shared: number } {
  if (!a.size || !b.size) return { ratio: 0, shared: 0 };
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return { ratio: shared / Math.min(a.size, b.size), shared };
}

export interface PostPool {
  platform: Platform;
  posts: SocialPost[];
}

/**
 * The organic post an ad also runs as: the post whose caption shares most of
 * the ad's copy (at least 60% of the shorter text and 5 words, so a shared
 * slogan alone doesn't count). Null when no post is close enough.
 */
export function matchPost(ad: Pick<Ad, "body" | "title">, pools: PostPool[]): AdEngagement | null {
  const adWords = words(`${ad.title ?? ""} ${ad.body ?? ""}`);
  if (adWords.size < 5) return null;
  let best: { pool: PostPool; post: SocialPost; ratio: number } | null = null;
  for (const pool of pools) {
    for (const post of pool.posts) {
      const { ratio, shared } = overlap(adWords, words(post.caption));
      if (shared >= 5 && ratio >= 0.6 && (!best || ratio > best.ratio)) best = { pool, post, ratio };
    }
  }
  if (!best) return null;
  const { pool, post } = best;
  return {
    platform: pool.platform,
    url: post.url,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares ?? null,
    views: post.views,
    sentiment: null,
    baseline: median(pool.posts.map(interactions).filter((n) => n > 0)),
  };
}

/** Versions of the same ad: its own variants plus other ads with the same opening. */
export function versionsOf(ad: Ad, siblings: Ad[]): number {
  const key = (a: Ad) => (a.hook ?? a.body ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
  const k = key(ad);
  const dupes = k.length >= 15 ? siblings.filter((s) => s.id !== ad.id && key(s) === k).length : 0;
  return ad.variants + dupes;
}

export function conversionScore(input: { ad: Ad; versions: number; today: string }): { score: number; parts: ScoreParts } {
  const { ad, versions, today } = input;
  const days = ad.active ? daysRunning(ad, today) : ad.started_at && ad.stopped_at ? Math.round((Date.parse(ad.stopped_at) - Date.parse(ad.started_at)) / 86_400_000) : daysRunning(ad, today);
  const parts = {
    longevity: longevityPart(days),
    reach: ad.active ? reachPart(ad.impression_rank, ad.rank_total) : null,
    repetition: repetitionPart(versions),
    engagement: engagementPart(ad.engagement),
    sentiment: ad.engagement?.sentiment !== null && ad.engagement?.sentiment !== undefined ? (ad.engagement.sentiment + 1) / 2 : null,
  };
  let sum = 0;
  let weight = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const v = parts[k];
    if (v === null) continue;
    sum += v * WEIGHTS[k];
    weight += WEIGHTS[k];
  }
  const score = weight ? Math.round((sum / weight) * 100) : 0;
  const confidence = parts.engagement !== null && parts.longevity !== null ? "high" : parts.longevity !== null && parts.reach !== null ? "medium" : "low";
  const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  return {
    score,
    parts: {
      longevity: round(parts.longevity),
      reach: round(parts.reach),
      repetition: round(parts.repetition),
      engagement: round(parts.engagement),
      sentiment: round(parts.sentiment),
      confidence,
    },
  };
}

export type ScoreTier = "top" | "solid" | "weak";
export const tierOf = (score: number | null | undefined): ScoreTier | null => (score === null || score === undefined ? null : score >= 70 ? "top" : score >= 45 ? "solid" : "weak");

export interface TopicRow {
  topic: string;
  ads: number;
  avgScore: number;
  /** Sum of scores: how much of what works this topic carries. */
  weight: number;
}

/** What the ads are about, weighted by how well they score: the topics that appear most among what works. */
export function topicsByScore(ads: Pick<Ad, "topic" | "score">[], limit = 8): TopicRow[] {
  const by = new Map<string, { label: string; scores: number[] }>();
  for (const a of ads) {
    if (!a.topic || a.score === null || a.score === undefined) continue;
    const key = a.topic.toLowerCase().trim();
    const row = by.get(key) ?? { label: a.topic.trim(), scores: [] };
    row.scores.push(a.score);
    by.set(key, row);
  }
  return [...by.values()]
    .map(({ label, scores }) => ({ topic: label, ads: scores.length, avgScore: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length), weight: scores.reduce((s, x) => s + x, 0) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** The hooks of the highest-scoring ads, one per distinct hook. */
export function topHooks<T extends Pick<Ad, "hook" | "score">>(ads: T[], limit = 6): T[] {
  const seen = new Set<string>();
  return [...ads]
    .filter((a) => a.hook && a.score !== null && a.score !== undefined)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((a) => {
      const k = a.hook!.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
