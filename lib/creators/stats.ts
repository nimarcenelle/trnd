import type { IdeaRun, TrendKind, Video } from "@/lib/db/types";

/**
 * The arithmetic behind every number on the page, all from public counts:
 * plays, likes, comments, shares and saves. Nothing here estimates what
 * TikTok does not show (watch time, followers gained per video).
 */

const DAY = 86_400_000;

/** A video younger than this is still collecting views: kept out of a creator's normal. */
export const SETTLE_HOURS = 48;

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (pos - lo));
}
export const median = (xs: number[]) => quantile(xs, 0.5);

const settled = (v: Pick<Video, "posted_at">, now: number) => !v.posted_at || now - Date.parse(v.posted_at) >= SETTLE_HOURS * 3_600_000;

/** Per 1,000 views, to one decimal; null without views. */
export function perK(n: number | null | undefined, views: number | null | undefined): number | null {
  if (n === null || n === undefined || !views) return null;
  return Math.round((n / views) * 10_000) / 10;
}

export interface Normal {
  /** Settled videos the normal is built from. */
  n: number;
  views: number | null;
  /** The middle half of their views: what a typical video of theirs gets. */
  low: number | null;
  high: number | null;
  savesPerK: number | null;
  commentsPerK: number | null;
}

/** What a typical video of this account gets, from its settled videos. */
export function normalOf(videos: Pick<Video, "views" | "saves" | "comments" | "posted_at">[], now = Date.now()): Normal {
  const base = videos.filter((v) => v.views !== null && settled(v, now));
  const views = base.map((v) => v.views as number);
  const ratio = (k: "saves" | "comments") =>
    median(base.filter((v) => v[k] !== null && v.views).map((v) => ((v[k] as number) / (v.views as number)) * 1000)) ?? null;
  return { n: base.length, views: median(views), low: quantile(views, 0.25), high: quantile(views, 0.75), savesPerK: ratio("saves"), commentsPerK: ratio("comments") };
}

/** How many times the account's normal this video got: 3.2 means 3.2× their median views. */
export function timesNormal(views: number | null, normal: Pick<Normal, "views">): number | null {
  if (views === null || !normal.views) return null;
  return Math.round((views / normal.views) * 10) / 10;
}

export type VideoRead = "do_more" | "talked_about" | "saved" | "below" | "typical" | "too_new";

/** One label per video of the creator's own: what its numbers say against their normal. */
export function readVideo(v: Pick<Video, "views" | "saves" | "comments" | "posted_at">, normal: Normal, now = Date.now()): VideoRead {
  if (!settled(v, now)) return "too_new";
  const x = timesNormal(v.views, normal);
  if (x !== null && x >= 2) return "do_more";
  if (x !== null && x <= 0.5) return "below";
  const saves = perK(v.saves, v.views);
  const comments = perK(v.comments, v.views);
  if (comments !== null && normal.commentsPerK && comments >= 2 * normal.commentsPerK) return "talked_about";
  if (saves !== null && normal.savesPerK && saves >= 2 * normal.savesPerK) return "saved";
  return "typical";
}

export type Stage = "early" | "rising" | "peaking" | "fading";

/**
 * Where a hashtag or sound is, from how many videos in our sample used it in
 * the last 7 days against the 7 before. New this week: early. Growing by half
 * or more: rising. About flat: peaking. Shrinking: fading.
 */
export function stageOf(recent: number, prior: number): Stage {
  if (!recent) return "fading";
  if (!prior) return "early";
  const r = recent / prior;
  return r >= 1.5 ? "rising" : r >= 0.8 ? "peaking" : "fading";
}

export interface TrendRow {
  kind: TrendKind;
  key: string;
  label: string;
  /** Videos in the sample using it in the last 7 days, and in the 7 before. */
  recent: number;
  prior: number;
  /** Views on those last-7-day videos. */
  views: number;
  /** Distinct creators using it in the last 14 days: one creator posting it ten times is not a trend. */
  creators: number;
  stage: Stage;
}

/** Hashtags and sounds across a sample of videos, each with its stage, the most used first. */
export function trendRows(videos: Pick<Video, "hashtags" | "sound" | "sound_original" | "posted_at" | "views" | "author">[], now = Date.now()): TrendRow[] {
  const rows = new Map<string, Omit<TrendRow, "stage" | "creators"> & { who: Set<string> }>();
  for (const v of videos) {
    if (!v.posted_at) continue;
    const age = (now - Date.parse(v.posted_at)) / DAY;
    if (age < 0 || age >= 14) continue;
    const keys: [TrendKind, string, string][] = v.hashtags.map((t) => ["hashtag", t, `#${t}`] as [TrendKind, string, string]);
    // An original sound is the creator's own voice, not a sound anyone can join.
    if (v.sound && v.sound_original !== true) keys.push(["sound", v.sound.toLowerCase(), v.sound]);
    for (const [kind, key, label] of keys) {
      const id = `${kind}:${key}`;
      const r = rows.get(id) ?? { kind, key, label, recent: 0, prior: 0, views: 0, who: new Set<string>() };
      if (age < 7) {
        r.recent++;
        r.views += v.views ?? 0;
      } else r.prior++;
      r.who.add(v.author);
      rows.set(id, r);
    }
  }
  return [...rows.values()]
    .map(({ who, ...r }) => ({ ...r, creators: who.size, stage: stageOf(r.recent, r.prior) }))
    .filter((r) => r.creators >= 2)
    .sort((a, b) => b.recent + b.prior - (a.recent + a.prior) || b.views - a.views);
}

export interface BorrowParts {
  /** How far it beat its creator's normal. */
  beat: number;
  /** How much of it is in the creator's niche: shared hashtags. */
  fit: number;
  /** How recent it is: a format copied in its first two weeks still feels fresh. */
  fresh: number;
  /** Saves per 1K views against its creator's normal: people keep it to use later. */
  saved: number;
}

/**
 * Is a peer's video worth borrowing, 0-100. Mostly how far it beat its own
 * creator's normal (it works for them), then whether it is in your niche,
 * still fresh, and saved. Weights sum to 1.
 */
export const BORROW_WEIGHTS: BorrowParts = { beat: 0.45, fit: 0.25, fresh: 0.15, saved: 0.15 };

export function borrowScore(
  v: Pick<Video, "views" | "saves" | "hashtags" | "posted_at">,
  normal: Normal,
  niche: string[],
  now = Date.now(),
): { score: number; parts: BorrowParts; times: number | null } {
  const times = timesNormal(v.views, normal);
  // 1× normal scores 0, 8× or more scores 1, on a log scale.
  const beat = times === null ? 0 : Math.max(0, Math.min(1, Math.log2(Math.max(times, 1)) / 3));
  const tags = new Set(niche);
  const shared = v.hashtags.filter((t) => tags.has(t)).length;
  const fit = Math.min(1, shared / 2);
  const age = v.posted_at ? (now - Date.parse(v.posted_at)) / DAY : 30;
  const fresh = Math.max(0, Math.min(1, 1 - (age - 3) / 25));
  const s = perK(v.saves, v.views);
  const saved = s === null || !normal.savesPerK ? 0.5 : Math.max(0, Math.min(1, s / (2 * normal.savesPerK)));
  const parts = { beat, fit, fresh, saved };
  const score = Math.round(100 * (Object.keys(BORROW_WEIGHTS) as (keyof BorrowParts)[]).reduce((sum, k) => sum + BORROW_WEIGHTS[k] * parts[k], 0));
  return { score, parts, times };
}

export interface PeerCandidate {
  handle: string;
  followers: number | null;
  /** Distinct niche hashtags they used in the sample. */
  tags: number;
  videos: number;
}

/**
 * The creators worth benchmarking against: a step or two ahead of you in the
 * same niche, the accounts you want to grow into, not your equals. Two to fifty
 * times your followers; a small account looks at 5K to 250K.
 */
export function aheadBand(followers: number | null): { min: number; max: number } {
  if (!followers) return { min: 10_000, max: Infinity };
  return { min: Math.max(5_000, Math.round(followers * 2)), max: Math.max(250_000, followers * 50) };
}

/** Where to fall back when too few in the niche sample are ahead of you: around your size, from a third of it. */
export function nearBand(followers: number | null): { min: number; max: number } {
  if (!followers) return { min: 1000, max: Infinity };
  return { min: Math.max(1000, Math.round(followers / 3)), max: Math.max(5_000, Math.round(followers * 2)) };
}

/** The size a creator ahead of you should ideally be: the next level up, about five times you, and for a small account at least 25K. */
export const AHEAD_TARGET = 5;
export const AHEAD_TARGET_MIN = 25_000;

/**
 * Which accounts in a hashtag sample to benchmark you against. Creators ahead
 * of you come first (best niche fit, then the closest to five times your size,
 * or 25K for a small account);
 * when the sample has too few, the list is topped up from around your size,
 * the biggest first.
 */
export function rankPeers(candidates: PeerCandidate[], self: { handle: string; followers: number | null }, limit: number): PeerCandidate[] {
  const mine = Math.max(1, self.followers ?? 1);
  const pool = candidates.filter((c) => c.handle !== self.handle && c.followers !== null);
  const within = (b: { min: number; max: number }) => (c: PeerCandidate) => c.followers! >= b.min && c.followers! <= b.max;
  const target = Math.max(mine * AHEAD_TARGET, AHEAD_TARGET_MIN);
  const step = (c: PeerCandidate) => (self.followers ? Math.abs(Math.log10(c.followers! / target)) : -c.followers!);
  const ahead = pool.filter(within(aheadBand(self.followers))).sort((a, b) => b.tags - a.tags || step(a) - step(b) || b.videos - a.videos);
  if (ahead.length >= limit) return ahead.slice(0, limit);
  const taken = new Set(ahead.map((c) => c.handle));
  const near = pool
    .filter((c) => !taken.has(c.handle) && within(nearBand(self.followers))(c))
    .sort((a, b) => b.tags - a.tags || b.followers! - a.followers! || b.videos - a.videos);
  return [...ahead, ...near].slice(0, limit);
}

/** How a matched creator compares with you, for the reason shown beside them: "4× your followers". */
export function aheadLine(followers: number | null, mine: number | null): string | null {
  if (!followers || !mine) return null;
  const x = followers / mine;
  if (x >= 1.5) return `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}× your followers`;
  return x >= 0.8 ? "About your size" : null;
}

/** Words of four letters or more, lowercased, for matching a posted video to the idea it came from. */
export function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}']{4,}/gu) ?? []).filter((w) => !STOP.has(w)));
}
const STOP = new Set(["this", "that", "with", "your", "from", "have", "what", "when", "here", "just", "they", "them", "will", "about", "into", "like", "more", "than", "then", "there", "their", "these", "which", "would", "every"]);

/**
 * The creator's own video, posted after the idea was added, that is that idea:
 * the one sharing the most words with the idea's hook and caption, and at
 * least three of them, or its hashtags. Null when none clearly is.
 */
export function matchIdea<V extends Pick<Video, "id" | "caption" | "hashtags" | "posted_at">>(
  run: Pick<IdeaRun, "idea" | "added_at">,
  videos: V[],
  taken: Set<string>,
): V | null {
  const want = words(`${run.idea.hook} ${run.idea.caption}`);
  const tags = new Set(run.idea.hashtags.map((t) => t.replace(/^#/, "").toLowerCase()));
  let best: { v: V; score: number } | null = null;
  for (const v of videos) {
    if (taken.has(v.id) || !v.posted_at || Date.parse(v.posted_at) < Date.parse(run.added_at)) continue;
    const got = words(v.caption ?? "");
    let shared = 0;
    for (const w of want) if (got.has(w)) shared++;
    const tagHits = v.hashtags.filter((t) => tags.has(t)).length;
    const score = shared + tagHits * 0.5;
    if ((shared >= 3 || (shared >= 2 && tagHits >= 2)) && (!best || score > best.score)) best = { v, score };
  }
  return best?.v ?? null;
}

/** Views 48 hours after posting against the creator's typical range when the idea was added. */
export function outcomeOf(views: number | null, expected: { low: number; high: number } | null): "beat" | "in_range" | "missed" | null {
  if (views === null || !expected) return null;
  return views > expected.high ? "beat" : views < expected.low ? "missed" : "in_range";
}

/** Followers gained across the snapshots in a window, and the days it covers; null with under two. */
export function followerChange(rows: { followers: number; captured_on: string }[], days = 30, now = Date.now()): { change: number; days: number } | null {
  const inWindow = rows.filter((r) => now - Date.parse(r.captured_on) <= days * DAY).sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  return { change: last.followers - first.followers, days: Math.round((Date.parse(last.captured_on) - Date.parse(first.captured_on)) / DAY) };
}

/** Posts per week over the span the videos cover. */
export function postsPerWeek(videos: Pick<Video, "posted_at">[], now = Date.now()): number | null {
  const times = videos.map((v) => (v.posted_at ? Date.parse(v.posted_at) : NaN)).filter((t) => !Number.isNaN(t));
  if (times.length < 2) return null;
  const span = Math.max(1, (now - Math.min(...times)) / DAY);
  return Math.round((times.length / span) * 7 * 10) / 10;
}
