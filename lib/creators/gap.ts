import { median } from "./stats";

/**
 * The gap: what a creator's typical video gets against the typical video of
 * creators 2 to 5 times their size in their niche, and (for an account that can
 * earn from it) what that gap could be worth from Creator Rewards.
 *
 * The rate is sourced, not invented: creators report Creator Rewards paying
 * roughly $0.40 to $1.00 per 1,000 qualified views (TikTok publishes no rate;
 * reports collected in 2026 by Fourthwall, Printify and others). Only videos
 * over a minute earn, only from 10K followers, and not every view qualifies, so
 * the dollar figure is a range and an upper bound at the creator's current pace.
 */

export const RPM_LOW = 0.4;
export const RPM_HIGH = 1;
/** Creator Rewards needs 10K followers; below it there is no dollar figure, only views. */
export const REWARDS_MIN_FOLLOWERS = 10_000;

export const RPM_ASSUMPTION =
  "Creator Rewards pays roughly $0.40–$1.00 per 1,000 qualified views, by creators' own reports (TikTok doesn't publish a rate). Only videos over a minute earn, and not every view qualifies, so this is the most the gap could be worth at your current pace.";

export interface Ahead {
  followers: number | null;
  /** Their typical (median) views per video. */
  typical: number | null;
}

export interface Gap {
  /** Their typical video. */
  mine: number;
  /** The average typical video of the creators ahead. */
  ahead: number;
  /** How many creators that average is over. */
  creators: number;
  /** Which band they came from: 2–5× the followers, or any creator ahead when too few sit in it. */
  band: "2-5x" | "ahead";
  /** Videos a month the dollar range assumes. */
  perMonth: number;
  /** What the gap is worth a month from Creator Rewards, rounded; null when the account can't earn it or isn't behind. */
  dollars: { low: number; high: number } | null;
}

const roundMoney = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n));

/**
 * The gap for one account. `perMonth` is how many videos they post a month
 * (from their own recent videos). Null when there is nothing to compare: no
 * typical of theirs, or no creators ahead with numbers.
 */
export function gapOf(mine: { followers: number | null; typical: number | null }, ahead: Ahead[], perMonth: number): Gap | null {
  if (!mine.typical || !mine.followers) return null;
  const withViews = ahead.filter((a) => a.typical && a.followers);
  const band = withViews.filter((a) => a.followers! >= mine.followers! * 2 && a.followers! <= mine.followers! * 5);
  const pool = band.length >= 2 ? band : withViews.filter((a) => a.followers! > mine.followers!);
  if (!pool.length) return null;
  const avg = pool.reduce((s, a) => s + a.typical!, 0) / pool.length;
  const per = Math.max(1, Math.round(perMonth));
  const gapViews = avg - mine.typical;
  const earns = mine.followers >= REWARDS_MIN_FOLLOWERS && gapViews > 0;
  return {
    mine: mine.typical,
    ahead: Math.round(avg),
    creators: pool.length,
    band: band.length >= 2 ? "2-5x" : "ahead",
    perMonth: per,
    dollars: earns ? { low: roundMoney((gapViews * per * RPM_LOW) / 1000), high: roundMoney((gapViews * per * RPM_HIGH) / 1000) } : null,
  };
}

/** Videos a month from posting dates: the last 28 days scaled to 30, else the goal's posts a week, else 4. */
export function postsPerMonth(postedAt: (string | null)[], postsPerWeek?: string | null, now = Date.now()): number {
  const recent = postedAt.filter((d) => d && now - Date.parse(d) <= 28 * 86_400_000).length;
  if (recent) return Math.round((recent * 30) / 28);
  const goal = postsPerWeek === "1-2" ? 1.5 : postsPerWeek === "3-4" ? 3.5 : postsPerWeek === "5+" ? 5 : null;
  return goal ? Math.round(goal * 4.3) : 4;
}

/** Each creator's typical views, from a pool of videos with authors. */
export function typicalByAuthor(videos: { author: string; views: number | null }[]): Map<string, number | null> {
  const by = new Map<string, number[]>();
  for (const v of videos) if (v.views !== null) by.set(v.author, [...(by.get(v.author) ?? []), v.views]);
  return new Map([...by].map(([a, vs]) => [a, median(vs)]));
}

/** "$310–$770/month". */
export const dollarRange = (d: { low: number; high: number }) => `$${d.low.toLocaleString("en-US")}–$${d.high.toLocaleString("en-US")}/month`;
