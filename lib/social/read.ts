import type { NewSocialPost, SocialPlatform, SocialPost, SocialPostKind } from "@/lib/db/types";
import { tokens } from "@/lib/scoring";

/**
 * The pure half of the social read. No I/O: everything here takes captured
 * posts and returns something an owner can act on — how often an account
 * posts, what its posts are doing, which one broke out, and what a rival did
 * this week worth knowing about.
 *
 * Engagement is likes + comments + shares. Views are kept apart because
 * only video carries them on every platform, and a rate that silently
 * divides by zero on a photo grid is not a rate.
 */

/** A post before it is attached to a business or a rival — what an adapter
 * returns; the caller decides whose it is. */
export type SocialDraft = Omit<NewSocialPost, "business_id" | "competitor_id">;

const DAY_MS = 86400_000;
const WINDOW_DAYS = 28;
const RECENT_DAYS = 7;
/** A breakout has to clear the account's usual by this much; anything less
 * is a good week, not a signal. */
const BREAKOUT_RATIO = 2;
/** Below this the "3x their usual" clause is noise and is left off the line. */
const NOTABLE_RATIO = 1.5;
const LINE_CLAUSE_CHARS = 80;

/** The fields the reads actually use; callers can pass full rows or trimmed
 * ones (a rival's posts loaded without captions still get a cadence). */
export type AccountPost = Pick<
  SocialPost,
  "caption" | "media_type" | "posted_at" | "likes" | "comments" | "shares" | "views" | "kind"
>;

export interface AccountRead<P extends AccountPost = SocialPost> {
  /** Posts in the last 28 days. */
  posts: number;
  postsPerWeek: number;
  /** Cadence 28 to 56 days ago — the comparison that shows a slowdown. */
  prevPostsPerWeek: number;
  /** Median likes + comments + shares per post, last 28 days. */
  engagementMedian: number;
  /** Median engagement / views over posts that have views; null when none do. */
  engagementRate: number | null;
  /** Share of last-28-day posts that are video, 0..1. */
  videoShare: number;
  byKind: Record<SocialPostKind, number>;
  /** Highest engagement in the last 28 days. */
  top: P | null;
  /** Last 7 days, at least 2x the account's median — the one that travelled. */
  breakout: P | null;
  lastPostedAt: string | null;
  silentDays: number | null;
}

export interface SocialMove {
  competitorId: string | null;
  platform: SocialPlatform;
  url: string;
  /** yyyy-mm-dd */
  when: string;
  kind: SocialPostKind;
  /** One owner-readable sentence: what they posted, how it did. */
  line: string;
  engagement: number;
  aboveMedian: boolean;
}

export function engagementOf(post: Pick<SocialPost, "likes" | "comments" | "shares">): number {
  return (Number(post.likes) || 0) + (Number(post.comments) || 0) + (Number(post.shares) || 0);
}

/** Order matters: an offer is a promo even when it is also new and tonight,
 * because the offer is the part an owner would answer. */
const KIND_RULES: [SocialPostKind, RegExp[]][] = [
  [
    "promo",
    [
      /\$\s?\d/,
      /\d+\s?%/,
      /\boff\b/,
      /\bdeals?\b/,
      /\bspecials?\b/,
      /\bbogo\b/,
      /\bhappy hour\b/,
      /\bdiscount/,
      /\bhalf[- ]price/,
    ],
  ],
  [
    "event",
    [
      /\btonight\b/,
      /\bthis (?:mon|tues|wednes|thurs|fri|satur|sun)day\b/,
      /\bthis weekend\b/,
      /\blive music\b/,
      /\bpop[- ]?up\b/,
      /\bjoin us\b/,
      /\btrivia\b/,
      /\brsvp\b/,
    ],
  ],
  [
    "new_item",
    [/\bnew\b/, /\bintroducing\b/, /\bnow serving\b/, /\bjust dropped\b/, /\blaunch/, /\bback on the menu\b/],
  ],
  [
    "proof",
    [
      // A quoted sentence long enough to be someone else's words.
      /["“][^"”]{15,}["”]/,
      /\bthank you\b/,
      /\bcustomers?\b/,
      /\b(?:5|five)[- ]stars?\b/,
      /\bregulars?\b/,
      /\breviews?\b/,
    ],
  ],
  [
    "behind_scenes",
    [/\bbehind the scenes\b/, /\bmeet\b/, /\bteam\b/, /\broasting\b/, /\bprep\b/, /\bhow we\b/, /\bprocess\b/],
  ],
];

/** Deterministic, no model: a caption is a promo because it names an offer,
 * an event because it names a time, and so on down the list. */
export function classifyPost(caption: string): SocialPostKind {
  const text = (caption ?? "").toLowerCase();
  if (!text.trim()) return "other";
  for (const [kind, rules] of KIND_RULES) {
    if (rules.some((re) => re.test(text))) return kind;
  }
  return "other";
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function postedMs(post: Pick<SocialPost, "posted_at">): number | null {
  if (!post.posted_at) return null;
  const at = Date.parse(post.posted_at);
  return Number.isFinite(at) ? at : null;
}

function kindOf(post: Pick<SocialPost, "caption" | "kind">): SocialPostKind {
  return post.kind ?? classifyPost(post.caption);
}

function emptyByKind(): Record<SocialPostKind, number> {
  return { promo: 0, new_item: 0, event: 0, behind_scenes: 0, proof: 0, other: 0 };
}

/**
 * Cadence, mix and the two posts worth naming, over a 28-day window with the
 * prior 28 days as the comparison. Posts dated in the future or undated are
 * ignored for the window math but still count toward "last posted".
 */
export function readAccount<P extends AccountPost>(posts: P[], now = new Date()): AccountRead<P> {
  const nowMs = now.getTime();
  const floor = nowMs - WINDOW_DAYS * DAY_MS;
  const prevFloor = nowMs - 2 * WINDOW_DAYS * DAY_MS;
  const recentCutoff = nowMs - RECENT_DAYS * DAY_MS;

  const current: P[] = [];
  let prevCount = 0;
  let lastMs: number | null = null;
  for (const p of posts) {
    const at = postedMs(p);
    if (at === null || at > nowMs) continue;
    if (lastMs === null || at > lastMs) lastMs = at;
    if (at >= floor) current.push(p);
    else if (at >= prevFloor) prevCount += 1;
  }

  const read: AccountRead<P> = {
    posts: current.length,
    postsPerWeek: Number((current.length / (WINDOW_DAYS / 7)).toFixed(1)),
    prevPostsPerWeek: Number((prevCount / (WINDOW_DAYS / 7)).toFixed(1)),
    engagementMedian: median(current.map(engagementOf)),
    engagementRate: null,
    videoShare: current.length ? current.filter((p) => p.media_type === "video").length / current.length : 0,
    byKind: emptyByKind(),
    top: null,
    breakout: null,
    lastPostedAt: lastMs === null ? null : new Date(lastMs).toISOString(),
    silentDays: lastMs === null ? null : Math.floor((nowMs - lastMs) / DAY_MS),
  };

  const rates = current.filter((p) => p.views > 0).map((p) => engagementOf(p) / p.views);
  if (rates.length) read.engagementRate = Number(median(rates).toFixed(4));

  for (const p of current) {
    read.byKind[kindOf(p)] += 1;
    if (!read.top || engagementOf(p) > engagementOf(read.top)) read.top = p;
  }

  if (read.engagementMedian > 0) {
    let bestRatio = 0;
    for (const p of current) {
      const at = postedMs(p);
      if (at === null || at < recentCutoff) continue;
      const ratio = engagementOf(p) / read.engagementMedian;
      if (ratio >= BREAKOUT_RATIO && ratio > bestRatio) {
        bestRatio = ratio;
        read.breakout = p;
      }
    }
  }

  return read;
}

/** Plural-blind token: "martinis" is "martini", "pastries" is "pastry". */
function stem(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function stems(text: string): Set<string> {
  return new Set([...tokens(text ?? "")].map(stem));
}

/**
 * Posts that talk about a term. A one- or two-word term needs every word
 * ("iced latte" is not any post that says "iced"); a longer term may miss
 * one ("pumpkin spice latte" still matches "pumpkin latte is back"). Plurals
 * count as the same word, and filler ("the", "near", "best") is ignored.
 */
export function postsOnTerm<P extends Pick<SocialPost, "caption">>(posts: P[], term: string): P[] {
  const want = [...stems(term)];
  if (want.length === 0) return [];
  const need = want.length <= 2 ? want.length : want.length - 1;
  return posts.filter((p) => {
    const have = stems(p.caption);
    let shared = 0;
    for (const t of want) if (have.has(t)) shared += 1;
    return shared >= need;
  });
}

const MOVE_VERBS: Record<SocialPostKind, string> = {
  promo: "Posted a promo",
  event: "Promoted an event",
  new_item: "Announced something new",
  proof: "Shared customer proof",
  behind_scenes: "Showed behind the scenes",
  other: "Posted",
};

/** The caption's sentences and lines, links, hashtags and handles stripped. */
function clausesOf(caption: string): string[] {
  return (caption ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\w.]+/g, " ")
    .split(/(?<=[.!?])\s+|\s+[—–|-]\s+|\n+/)
    .map((c) =>
      c
        .replace(/\s+/g, " ")
        .replace(/^[\s,;:.!?]+|[\s,;:.!?]+$/g, "")
        .trim(),
    )
    .filter((c) => /[a-z0-9]/i.test(c));
}

/** Owner-facing text carries no em dashes, arrows or multiplication signs,
 * even when the rival's caption did; nested double quotes become single. */
function plainText(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*(?:→|⇒|->)\s*/g, " to ")
    .replace(/(\d)\s*×/g, "$1x")
    .replace(/×/g, "x")
    .replace(/["“”]/g, "'")
    .replace(/,\s*,/g, ",")
    .trim();
}

function bounded(s: string): string {
  if (s.length <= LINE_CLAUSE_CHARS) return s;
  const cut = s.slice(0, LINE_CLAUSE_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
}

/** The clause worth quoting: the one naming the offer when there is one
 * (an owner prices against "$6 martinis", not "Thursday is back"), else
 * the first. */
function quoteFor(caption: string, offer: string | null): string {
  const clauses = clausesOf(caption);
  if (clauses.length === 0) return "";
  const withOffer = offer ? clauses.find((c) => c.toLowerCase().includes(offer.toLowerCase())) : undefined;
  return bounded(plainText(withOffer ?? clauses[0]));
}

/** "$12", "$4.50", "20% off" — the number an owner would price against. */
export function offerIn(caption: string): string | null {
  const m = (caption ?? "").match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\s?%(?:\s?off\b)?/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function fmtCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function counted(n: number, noun: string): string {
  return `${fmtCount(n)} ${n === 1 ? noun : `${noun}s`}`;
}

/** Written "3x", never with a multiplication sign. */
function fmtRatio(r: number): string {
  return r >= 2 ? `${Math.round(r)}x` : `${r.toFixed(1)}x`;
}

/** One number the owner recognises from the app (likes, else views, else
 * comments, else shares), plus how it compares to the account's usual. */
function performanceClause(post: SocialPost, ratio: number | null): string {
  let lead = "no engagement yet";
  if (post.likes > 0) lead = counted(post.likes, "like");
  else if (post.views > 0) lead = counted(post.views, "view");
  else if (post.comments > 0) lead = counted(post.comments, "comment");
  else if (post.shares > 0) lead = counted(post.shares, "share");
  return ratio !== null && ratio >= NOTABLE_RATIO ? `${lead}, ${fmtRatio(ratio)} their usual` : lead;
}

/**
 * What rivals did recently, best-performing first (newer first on a tie).
 * "Their usual" is each rival account's own median across every post passed
 * in, not the pool's: a quiet account's 80 likes can be a bigger move than
 * a loud one's 300.
 *
 * line: `Posted a promo: "Half-price espresso martinis Thursdays" (214 likes, 3x their usual)`
 */
export function rivalMoves(
  posts: SocialPost[],
  now = new Date(),
  opts: { days?: number; max?: number } = {},
): SocialMove[] {
  const days = opts.days ?? RECENT_DAYS;
  const max = opts.max ?? 6;
  const nowMs = now.getTime();
  const cutoff = nowMs - days * DAY_MS;
  const accountKey = (p: SocialPost) => `${p.competitor_id ?? ""}:${p.platform}`;

  const byAccount = new Map<string, number[]>();
  for (const p of posts) {
    const xs = byAccount.get(accountKey(p)) ?? [];
    xs.push(engagementOf(p));
    byAccount.set(accountKey(p), xs);
  }
  const medians = new Map<string, number>();
  for (const [key, xs] of byAccount) medians.set(key, median(xs));

  const ranked: { move: SocialMove; at: number }[] = [];
  for (const p of posts) {
    const at = postedMs(p);
    if (at === null || at < cutoff || at > nowMs) continue;
    const usual = medians.get(accountKey(p)) ?? 0;
    const engagement = engagementOf(p);
    const ratio = usual > 0 ? engagement / usual : null;
    const kind = kindOf(p);
    const offer = offerIn(p.caption);
    const quote = quoteFor(p.caption, offer);
    let what = quote ? `${MOVE_VERBS[kind]}: "${quote}"` : MOVE_VERBS[kind];
    if (offer && !quote.toLowerCase().includes(offer.toLowerCase())) what += `, ${offer}`;
    const move: SocialMove = {
      competitorId: p.competitor_id,
      platform: p.platform,
      url: p.url,
      when: new Date(at).toISOString().slice(0, 10),
      kind,
      line: `${what} (${performanceClause(p, ratio)})`,
      engagement,
      aboveMedian: usual > 0 && engagement > usual,
    };
    ranked.push({ move, at });
  }

  return ranked
    .sort((a, b) => b.move.engagement - a.move.engagement || b.at - a.at)
    .slice(0, max)
    .map((r) => r.move);
}
