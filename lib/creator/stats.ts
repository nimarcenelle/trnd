import type { SocialPost } from "@/lib/db/types";

/**
 * The creator check's numbers, from a creator's own recent posts and nothing
 * else. Every post is measured against the creator's own median, so a small
 * account and a large one read the same way and nothing is compared with a
 * benchmark we do not have.
 */

/** A post at or above this multiple of the creator's median reached past their usual audience. */
export const BREAKOUT_X = 2;
/** A post at or below this multiple of the median stalled. */
export const STALLED_X = 0.5;
/** Fewer posts than this and a median says little. */
export const MIN_POSTS = 4;

export type PostTier = "breakout" | "typical" | "stalled";

export interface ScoredPost {
  url: string | null;
  caption: string | null;
  posted_at: string | null;
  kind: string | null;
  /** Likes + comments + shares. */
  interactions: number;
  views: number | null;
  /** Interactions over the creator's median. */
  multiple: number;
  tier: PostTier;
}

export interface CreatorStats {
  posts: ScoredPost[];
  medianInteractions: number;
  breakouts: number;
  stalled: number;
  /** Share of posts that broke out, 0-1. */
  breakoutRate: number;
  /** Share of posts that stalled, 0-1. */
  stalledRate: number;
  /** Best post's multiple of the median. */
  bestMultiple: number;
  /** How much of all interactions the top fifth of posts took, 0-1: high means a few posts carry the account. */
  topShare: number;
}

export const interactionsOf = (p: Pick<SocialPost, "likes" | "comments" | "shares">) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function tierOf(multiple: number): PostTier {
  return multiple >= BREAKOUT_X ? "breakout" : multiple <= STALLED_X ? "stalled" : "typical";
}

/** Posts with any interaction count, newest first, each against the median. Null when there are too few to judge. */
export function creatorStats(recent: SocialPost[]): CreatorStats | null {
  const counted = recent.filter((p) => p.likes !== null || p.comments !== null);
  if (counted.length < MIN_POSTS) return null;
  const med = median(counted.map(interactionsOf));
  const base = Math.max(1, med);
  const posts: ScoredPost[] = counted
    .map((p) => {
      const interactions = interactionsOf(p);
      const multiple = Math.round((interactions / base) * 10) / 10;
      return { url: p.url, caption: p.caption, posted_at: p.posted_at, kind: p.kind, interactions, views: p.views, multiple, tier: tierOf(multiple) };
    })
    .sort((a, b) => (Date.parse(b.posted_at ?? "") || 0) - (Date.parse(a.posted_at ?? "") || 0));
  const breakouts = posts.filter((p) => p.tier === "breakout").length;
  const stalled = posts.filter((p) => p.tier === "stalled").length;
  const total = posts.reduce((s, p) => s + p.interactions, 0);
  const top = [...posts].sort((a, b) => b.interactions - a.interactions).slice(0, Math.max(1, Math.round(posts.length / 5)));
  return {
    posts,
    medianInteractions: med,
    breakouts,
    stalled,
    breakoutRate: breakouts / posts.length,
    stalledRate: stalled / posts.length,
    bestMultiple: Math.max(...posts.map((p) => p.multiple)),
    topShare: total ? top.reduce((s, p) => s + p.interactions, 0) / total : 0,
  };
}

/** The one sentence the numbers say, before any model reads the captions. "their" for a result someone else is reading. */
export function headline(s: CreatorStats, your: "your" | "their" = "your"): string {
  const n = s.posts.length;
  if (s.breakouts === 0) return `None of ${your} last ${n} posts reached twice ${your} usual engagement. Every post is landing with the same people.`;
  if (s.stalled >= s.breakouts) return `${s.breakouts} of ${your} last ${n} posts broke out, and ${s.stalled} stalled at half ${your} usual engagement or less.`;
  return `${s.breakouts} of ${your} last ${n} posts broke out, the best at ${s.bestMultiple}× ${your} usual. The question is what they did that the rest didn't.`;
}
