import { median, type CreatorStats } from "./stats";

/**
 * The niche benchmark: the top posts under the creator's niche hashtag right
 * now, and how far their usual post is from them. Pure; the network read is
 * in niche.ts. "Top" means what the platform shows first for the hashtag,
 * which favors what is doing well, so this is the bar, not the average.
 */

export interface BenchPost {
  handle: string;
  followers: number | null;
  caption: string | null;
  interactions: number;
  views: number | null;
  url: string | null;
  /** This post's interactions over the creator's usual post. */
  timesYou: number;
}

export interface Benchmark {
  /** The hashtag searched, without the #. */
  tag: string;
  platform: "tiktok" | "instagram";
  /** The best post of each creator found, highest first, at most six. */
  posts: BenchPost[];
  /** The median interactions of those posts. */
  topMedian: number;
  /** topMedian over the creator's usual post. */
  gap: number;
  /**
   * Per follower: the top posts' median interactions-per-follower over the
   * creator's. Fair to small accounts. Null without follower counts (Instagram
   * hashtag reads carry none).
   */
  perFollowerGap: number | null;
}

/** Hashtags that say nothing about a niche. */
const GENERIC = new Set(["fyp", "foryou", "foryoupage", "fy", "fypシ", "viral", "trending", "explore", "explorepage", "reels", "reel", "tiktok", "instagram", "instagood", "xyzbca", "capcut", "foryourpage", "viralvideo", "trend", "love", "follow", "like"]);

export const toTag = (s: string) => s.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "").slice(0, 40);

/** The niche as a hashtag: the one typed, else the creator's most used specific hashtag, else null. */
export function nicheTag(niche: string, captions: (string | null)[]): string | null {
  if (niche.trim()) return toTag(niche) || null;
  const counts = new Map<string, number>();
  for (const c of captions) {
    for (const m of (c ?? "").toLowerCase().matchAll(/#([\p{L}0-9_]{3,40})/gu)) {
      const tag = toTag(m[1]);
      if (tag && !GENERIC.has(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

export interface RawNichePost {
  handle: string | null;
  followers: number | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  url: string | null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function benchmarkFrom(
  raw: RawNichePost[],
  self: { handle: string; followers: number | null | undefined; stats: CreatorStats; tag: string; platform: "tiktok" | "instagram" },
): Benchmark | null {
  const usual = Math.max(1, self.stats.medianInteractions);
  const best = new Map<string, RawNichePost & { interactions: number }>();
  for (const p of raw) {
    if (!p.handle || p.handle.toLowerCase() === self.handle.toLowerCase()) continue;
    if ((p.likes ?? -1) < 0 && (p.comments ?? -1) < 0) continue;
    const interactions = Math.max(0, p.likes ?? 0) + Math.max(0, p.comments ?? 0) + Math.max(0, p.shares ?? 0);
    const prev = best.get(p.handle.toLowerCase());
    if (!prev || interactions > prev.interactions) best.set(p.handle.toLowerCase(), { ...p, interactions });
  }
  const ranked = [...best.values()].sort((a, b) => b.interactions - a.interactions);
  if (ranked.length < 3) return null;
  const posts: BenchPost[] = ranked.slice(0, 6).map((p) => ({
    handle: p.handle!,
    followers: p.followers,
    caption: p.caption,
    interactions: p.interactions,
    views: p.views,
    url: p.url,
    timesYou: round1(p.interactions / usual),
  }));
  const topMedian = median(posts.map((p) => p.interactions));
  const rates = posts.filter((p) => p.followers && p.followers > 0).map((p) => p.interactions / p.followers!);
  const selfRate = self.followers ? self.stats.medianInteractions / self.followers : null;
  return {
    tag: self.tag,
    platform: self.platform,
    posts,
    topMedian,
    gap: round1(topMedian / usual),
    perFollowerGap: rates.length >= 3 && selfRate ? round1(median(rates) / Math.max(selfRate, 1e-6)) : null,
  };
}

/** The one line the comparison says. */
export function gapLine(b: Benchmark, your: "your" | "their" = "your"): string {
  if (b.perFollowerGap !== null && b.perFollowerGap >= 1.5) return `Per follower, the top #${b.tag} posts pull ${b.perFollowerGap}× what ${your} usual post does.`;
  if (b.gap >= 1.5) return `The top #${b.tag} posts get ${b.gap}× ${your} usual post.`;
  return `${your === "your" ? "Your" : "Their"} usual post is level with the top #${b.tag} posts right now.`;
}
