import type { IdeaRun, TrendKind, Video } from "@/lib/db/types";
import { times } from "@/lib/format";

import { normalizeFormat, type FormatKey } from "./formats";

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
  const x = Math.round((views / normal.views) * 10) / 10;
  // Some views, far under the usual: a small number, not 0 (shown as "<0.1×").
  return x === 0 && views > 0 ? 0.01 : x;
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

/** Below this many videos this week, or this many distinct creators, a count is too small to call a stage. */
export const TREND_MIN = 5;

/** Whether a trend has enough videos and creators behind it to be labeled early, rising, peaking or fading. */
export function callable(t: Pick<TrendRow, "recent" | "creators">): boolean {
  return t.recent >= TREND_MIN && t.creators >= TREND_MIN;
}

/** Hashtags every kind of video carries: not a signal about a niche. */
const NOT_NICHE = new Set(["fyp"]);

/** The hashtags an account uses most across its videos, most used first (ties in order of first use), without the generic ones. */
export function topHashtags(videos: { hashtags: string[] }[], n = 3): string[] {
  const count = new Map<string, number>();
  for (const v of videos) for (const h of new Set(v.hashtags.map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean))) count.set(h, (count.get(h) ?? 0) + 1);
  return [...count.entries()]
    .filter(([h]) => !NOT_NICHE.has(h))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([h]) => h);
}

/**
 * The trends to show a creator: without the generic tags, and the ones too small
 * to call moved to the bottom (the order is otherwise kept).
 */
export function trendList<T extends Pick<TrendRow, "kind" | "key" | "recent" | "creators">>(rows: T[]): T[] {
  return rows
    .filter((t) => !(t.kind === "hashtag" && NOT_NICHE.has(t.key.replace(/^#/, "").toLowerCase())))
    .map((t, i) => ({ t, i, ok: callable(t) }))
    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.i - b.i)
    .map(({ t }) => t);
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

/** A breakout: this many times its creator's usual views or more. */
export const HIT_X = 2;
/** The window a format is measured over, and the one before it is compared with. */
export const FORMAT_DAYS = 30;
/** Below this many videos, or this many creators, a format's hit rate is noise: not shown. */
export const FORMAT_MIN_VIDEOS = 6;
export const FORMAT_MIN_CREATORS = 3;

type FormatVideo = Pick<Video, "video_id" | "author" | "is_self" | "format" | "views" | "posted_at">;

export interface FormatRow<V extends FormatVideo = FormatVideo> {
  format: FormatKey;
  /** Settled videos in it from creators ahead of you, in the last 30 days, each with its creator's usual known. */
  videos: number;
  creators: number;
  /** Of those, how many got 2× their own creator's usual or more, from how many creators, and the share. */
  hits: number;
  hitCreators: number;
  hitRate: number;
  /** The middle video's views against its creator's usual. */
  medianX: number | null;
  /** The same counts for the 30 days before; null while under half of that window's videos are tagged (a count of untagged videos would read as none). */
  prior: { videos: number; hits: number; hitRate: number | null } | null;
  /** The video in it that beat its creator's usual by the most, last 30 days. */
  best: { v: V; times: number } | null;
  /** The creator's own videos in it (all passed in, any age), the latest, and the middle one against their usual. */
  mine: { videos: number; last: string | null; medianX: number | null };
}

const share = (hits: number, n: number) => (n ? Math.round((hits / n) * 100) / 100 : 0);

/**
 * Which formats are working for the creators ahead of you: for each format in
 * the fixed list, the peer videos in it from the last 30 days, how many beat
 * their own creator's usual by 2× or more, the middle one's ×, the 30 days
 * before, the best example, and whether you have posted one. Each video is
 * measured against its own creator, so a big account's views don't drown a
 * small one's. Videos younger than 48 hours, untagged, or from a creator with
 * no usual yet are left out. Show only rows that pass `formatCallable`.
 */
export function formatRows<V extends FormatVideo>(videos: V[], normals: Map<string, Pick<Normal, "views">>, now = Date.now()): FormatRow<V>[] {
  type Acc = { cur: { v: V; x: number }[]; prior: { v: V; x: number }[]; mine: { v: V; x: number | null }[] };
  const acc = new Map<FormatKey, Acc>();
  const get = (f: FormatKey) => acc.get(f) ?? (acc.set(f, { cur: [], prior: [], mine: [] }).get(f) as Acc);
  // The 30 days before, every countable video and the tagged ones: older videos are tagged last.
  const priorSeen = { all: 0, tagged: 0 };
  for (const v of videos) {
    if (!v.posted_at) continue;
    const f = normalizeFormat(v.format);
    const n = normals.get(v.author);
    const x = n ? timesNormal(v.views, n) : null;
    if (v.is_self) {
      if (f) get(f).mine.push({ v, x: settled(v, now) ? x : null });
      continue;
    }
    if (x === null || !settled(v, now)) continue;
    const age = (now - Date.parse(v.posted_at)) / DAY;
    if (age < 0 || age >= 2 * FORMAT_DAYS) continue;
    const window = age < FORMAT_DAYS ? "cur" : "prior";
    if (window === "prior") {
      priorSeen.all++;
      if (f) priorSeen.tagged++;
    }
    if (f) get(f)[window].push({ v, x });
  }
  const priorKnown = priorSeen.all > 0 && priorSeen.tagged >= priorSeen.all / 2;
  const rows: FormatRow<V>[] = [];
  for (const [format, a] of acc) {
    if (!a.cur.length && !a.prior.length) continue;
    const hits = a.cur.filter((r) => r.x >= HIT_X);
    const priorHits = a.prior.filter((r) => r.x >= HIT_X).length;
    const best = [...a.cur].sort((p, q) => q.x - p.x || (q.v.views ?? 0) - (p.v.views ?? 0))[0];
    const mineX = a.mine.map((r) => r.x).filter((x): x is number => x !== null);
    rows.push({
      format,
      videos: a.cur.length,
      creators: new Set(a.cur.map((r) => r.v.author)).size,
      hits: hits.length,
      hitCreators: new Set(hits.map((r) => r.v.author)).size,
      hitRate: share(hits.length, a.cur.length),
      medianX: middleX(a.cur.map((r) => r.x)),
      prior: priorKnown ? { videos: a.prior.length, hits: priorHits, hitRate: a.prior.length ? share(priorHits, a.prior.length) : null } : null,
      best: best ? { v: best.v, times: best.x } : null,
      mine: { videos: a.mine.length, last: a.mine.map((r) => r.v.posted_at as string).sort().at(-1) ?? null, medianX: middleX(mineX) },
    });
  }
  return rows.sort((p, q) => Number(formatCallable(q)) - Number(formatCallable(p)) || q.hitRate - p.hitRate || (q.medianX ?? 0) - (p.medianX ?? 0) || q.videos - p.videos);
}

/**
 * The middle video's ×: with an even count, the lower of the two middles, an
 * actual video's number. Averaging them would turn 2× and 97× into a "middle"
 * 50× that no video got.
 */
function middleX(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** Whether a format has enough videos and creators behind it to show its hit rate. */
export function formatCallable(r: Pick<FormatRow, "videos" | "creators">): boolean {
  return r.videos >= FORMAT_MIN_VIDEOS && r.creators >= FORMAT_MIN_CREATORS;
}

/**
 * The share of all peer videos (any format, tagged or not) in the last 30 days
 * at 2× their creator's usual: what a format's hit rate is compared with.
 */
export function baseHitRate(videos: FormatVideo[], normals: Map<string, Pick<Normal, "views">>, now = Date.now()): number | null {
  const xs = videos
    .filter((v) => !v.is_self && v.posted_at && settled(v, now) && now - Date.parse(v.posted_at) < FORMAT_DAYS * DAY)
    .map((v) => (normals.get(v.author) ? timesNormal(v.views, normals.get(v.author)!) : null))
    .filter((x): x is number => x !== null);
  return xs.length ? share(xs.filter((x) => x >= HIT_X).length, xs.length) : null;
}

/**
 * A format working for the creators ahead of you: enough behind it to call, hits
 * from at least two of them (not one creator's streak), and a hit rate at least
 * a quarter and half again what their videos manage overall.
 */
export function formatWorking(r: FormatRow, base: number | null): boolean {
  return formatCallable(r) && r.hitCreators >= 2 && r.hitRate >= Math.max(0.25, 1.5 * (base ?? 0));
}

/**
 * One working format as the plan reads it: the numbers behind its hit rate, the
 * 30 days before, the best example by id, and whether the owner has posted one.
 */
export function formatLine(r: FormatRow, base: number | null): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const you = r.mine.videos ? `you posted ${r.mine.videos}${r.mine.medianX !== null ? `, middle one ${times(r.mine.medianX)} your usual` : ""}` : "you haven't posted one";
  return [
    `[${r.format}] ${r.hits} of ${r.videos} videos from ${r.creators} creators ahead hit 2× their usual (${pct(r.hitRate)}${base !== null ? `, against ${pct(base)} across everything they posted` : ""})`,
    r.medianX !== null ? `middle video ${times(r.medianX)} their usual` : null,
    r.prior ? `30 days before: ${r.prior.videos} videos${r.prior.hitRate !== null ? `, ${pct(r.prior.hitRate)} hit 2×` : ""}` : null,
    r.best ? `best example: [${r.best.v.video_id}] @${r.best.v.author}, ${times(r.best.times)} their usual` : null,
    you,
  ]
    .filter(Boolean)
    .join(" · ");
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
 * still fresh, and saved. Weights sum to 1. A creator the owner picked fits by
 * being picked: the hashtags they use don't count against them.
 */
export const BORROW_WEIGHTS: BorrowParts = { beat: 0.45, fit: 0.25, fresh: 0.15, saved: 0.15 };

export function borrowScore(
  v: Pick<Video, "views" | "saves" | "hashtags" | "posted_at">,
  normal: Normal,
  niche: string[],
  { now = Date.now(), chosen = false }: { now?: number; chosen?: boolean } = {},
): { score: number; parts: BorrowParts; times: number | null; chosen: boolean } {
  const times = timesNormal(v.views, normal);
  // 1× normal scores 0, 8× or more scores 1, on a log scale.
  const beat = times === null ? 0 : Math.max(0, Math.min(1, Math.log2(Math.max(times, 1)) / 3));
  const tags = new Set(niche);
  const shared = v.hashtags.filter((t) => tags.has(t)).length;
  const fit = chosen ? 1 : Math.min(1, shared / 2);
  const age = v.posted_at ? (now - Date.parse(v.posted_at)) / DAY : 30;
  const fresh = Math.max(0, Math.min(1, 1 - (age - 3) / 25));
  const s = perK(v.saves, v.views);
  const saved = s === null || !normal.savesPerK ? 0.5 : Math.max(0, Math.min(1, s / (2 * normal.savesPerK)));
  const parts = { beat, fit, fresh, saved };
  const score = Math.round(100 * (Object.keys(BORROW_WEIGHTS) as (keyof BorrowParts)[]).reduce((sum, k) => sum + BORROW_WEIGHTS[k] * parts[k], 0));
  return { score, parts, times, chosen };
}

/** A video this score or better is worth showing the plan; the owner's picks skip the bar. */
const BORROW_MIN = 45;

/**
 * The videos a plan is written from: half the seats go to the creators the owner
 * picked, shared between them, best video first, and always at least their best;
 * the other half to the best of the rest. Seats one side can't fill go to the other.
 */
export function pickBorrow<T extends { v: { author: string }; score: number; chosen: boolean }>(rows: T[], seats = 8): T[] {
  const best = [...rows].sort((a, b) => b.score - a.score);
  const picks: T[] = [];
  const byAuthor = new Map<string, T[]>();
  for (const r of best.filter((r) => r.chosen)) byAuthor.set(r.v.author, [...(byAuthor.get(r.v.author) ?? []), r]);
  const queues = [...byAuthor.values()];
  const takeChosen = (n: number) => {
    for (let taken = 0; taken < n && queues.some((q) => q.length); ) {
      for (const q of queues) {
        const r = q.shift();
        if (r && taken < n) {
          picks.push(r);
          taken++;
        } else if (r) q.unshift(r);
      }
    }
  };
  takeChosen(Math.ceil(seats / 2));
  const rest = best.filter((r) => !r.chosen && r.score >= BORROW_MIN);
  picks.push(...rest.slice(0, seats - picks.length));
  takeChosen(seats - picks.length);
  return picks.sort((a, b) => b.score - a.score);
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
  if (x > 100) return "Over 100× your followers";
  if (x >= 1.5) return `${times(x)} your followers`;
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
