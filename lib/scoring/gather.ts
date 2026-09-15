/**
 * Where each of the four signals' evidence lives, turned into the inputs the
 * pure scorers take (lib/scoring/model.ts).
 *
 * The scorers never touch the database; this is the only file that knows a
 * Customer volume reading is a signal's value, that Reddit titles and Google
 * autocomplete are what customers say, that a rival's pulled ad lives in an
 * older competitor read, and that a baseline is the signal_readings table.
 *
 * Nothing here invents a number. Stock comes from the store's catalog when
 * it was read and is null otherwise; margin has no data source yet; a
 * baseline with nothing in it is an empty array, and the scorer decides
 * what that does to its confidence.
 */

import { historyOnTerm, MIN_AD_IMPRESSIONS, readAdHistory } from "@/lib/ads/history-read";
import { targetCustomerOf } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type {
  AdHistory,
  Business,
  BusinessBrief,
  CompetitorRead,
  NewSignalReading,
  Review,
  Service,
  Signal,
  SignalReading,
  SocialComment,
  SocialPost,
} from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { loadSignalContext, type SignalContext } from "@/lib/recommend/four-signals";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { audienceMatch, matchService, tokens } from "@/lib/scoring";
import { normalizeTerm } from "@/lib/signals/normalize";
import { engagementOf, postsOnTerm } from "@/lib/social/read";

import type { BrandInput, CompetitiveInput, CultureInput, CustomerInput, DailyPoint, LevelKind, SignalName } from "./model";

export const SETTINGS_HREF = "/app/settings";

const DAY_MS = 86400_000;
/** The trailing window a reading is ranked against, and the series length. */
export const BASELINE_DAYS = 90;
/** "Running this angle now" means inside the last two weeks. */
const NOW_DAYS = 14;
/** The prior window ends where the rival reads stop being loaded. */
const PRIOR_DAYS = 45;
/** An ad pulled inside a week did not work for the rival who ran it. */
const WEAK_AD_DAYS = 7;
/** Fewer own posts than this and "your usual" is not a number. */
const OWN_POSTS_MIN = 5;
/** Enough customer words to classify; past this it is the same words again. */
const MAX_ACTIVITY = 60;
/** A year of the term's own history, for "is this its usual active window". */
export const SEASON_DAYS = 400;
/** Under this span or this many points a year's shape is not readable. */
const SEASON_MIN_SPAN_DAYS = 300;
const SEASON_MIN_POINTS = 30;
const SEASON_MIN_MONTHS = 8;
/** Short-form views behind a shares-and-saves rate before it means anything. */
const MIN_ACTION_VIEWS = 2000;
/** Category growth needs a few reads before a median means anything. */
const MIN_GROWTH_READS = 3;
/** Culture growth is read once per category, not per term. */
export const CATEGORY_TERM = "_category";
/** Comments this old still say what the customer wants to know. */
const COMMENT_DAYS = 60;
/** Rival reviews mentioning the term before their complaint rate means anything. */
export const MIN_REVIEWS_ON_TERM = 3;
/** One or two stars: a complaint, whatever the words. */
const LOW_STAR = 2;

/** Everything the gatherer reads once per ranking, then per term. */
export interface GradeContext {
  brief: BusinessBrief | null;
  services: Service[];
  /** The category signal pool the ranking considered. */
  pool: Signal[];
  signals: SignalContext;
  /** Every direct rival's ad reads in the window, oldest first. The latest
   * read alone cannot show an ad that was pulled. */
  adReads: CompetitorRead[];
  /** What customers wrote under the brand's and its rivals' posts. */
  comments: SocialComment[];
  /** The brand's and its rivals' reviews (Places, Trustpilot, their sites). */
  reviews: Review[];
  baselines: Record<SignalName, SignalReading[]>;
  now: Date;
}

export interface GatherOptions {
  /** The judged 0-1 fit of this term to what the business sells. Falls back
   * to the token match when the ranking did not judge it. */
  fit?: number | null;
}

export interface GatheredInputs {
  customer: CustomerInput;
  culture: CultureInput;
  competitive: CompetitiveInput;
  brand: BrandInput;
  /** This run's raw readings, for the caller to store as tomorrow's baseline. */
  readings: NewSignalReading[];
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn("[gather] read failed (non-fatal):", (err as Error).message);
    return fallback;
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const matchesTerm = (s: Pick<Signal, "normalized_term">, signal: Pick<Signal, "normalized_term">) =>
  s.normalized_term === signal.normalized_term || s.normalized_term.startsWith(`${signal.normalized_term}_`);

/**
 * Load what every term's gather shares: the four-signal context, all rival ad
 * reads in the window, and the trailing readings per signal. Pieces the
 * ranking already loaded can be handed in so nothing is read twice.
 */
export async function loadGradeContext(
  repo: Repo,
  business: Business,
  given: Partial<Omit<GradeContext, "baselines" | "adReads">> = {},
): Promise<GradeContext> {
  const [services, brief, pool] = await Promise.all([
    given.services ?? repo.listServices(business.id),
    given.brief !== undefined ? given.brief : repo.getBusinessBrief(business.id),
    given.pool ?? repo.listSignalsForCategory(business.category, { sinceDays: 14 }),
  ]);
  const [signals, reads, comments, reviews, customer, culture, competitive, brand] = await Promise.all([
    given.signals ?? loadSignalContext(repo, business, brief, pool),
    safe(repo.listCompetitorReads(business.id, { sinceDays: PRIOR_DAYS }), [] as CompetitorRead[]),
    safe(repo.listSocialComments(business.id, { sinceDays: COMMENT_DAYS }), [] as SocialComment[]),
    safe(repo.listReviews(business.id), [] as Review[]),
    ...(["customer", "culture", "competitive", "brand"] as const).map((signal) =>
      safe(repo.listSignalReadings(business.id, { signal, sinceDays: BASELINE_DAYS }), [] as SignalReading[]),
    ),
  ]);
  const direct = new Set(signals.direct.map((c) => c.id));
  return {
    brief,
    services,
    pool,
    signals,
    // Meta (kind "ads") and Google (kind "google_ads") reads both say what a
    // rival is paying to show.
    adReads: reads
      .filter((r) => (r.kind === "ads" || r.kind === "google_ads") && direct.has(r.competitor_id))
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    comments: comments.filter((c) => c.competitor_id === null || direct.has(c.competitor_id)),
    reviews: reviews.filter((r) => r.competitor_id === null || direct.has(r.competitor_id)),
    baselines: { customer, culture, competitive, brand },
    now: given.now ?? new Date(),
  };
}

/* -------------------------------- baselines ------------------------------- */

/**
 * The trailing values of one reading key. Today's rows are left out: a
 * same-day rerun would otherwise rank a term against itself.
 */
function baselineOf(rows: SignalReading[], key: string, today: string, opts: { latestPerTerm?: boolean } = {}): number[] {
  const past = rows.filter((r) => r.captured_on < today && isNum(r.reading?.[key]));
  if (!opts.latestPerTerm) return past.map((r) => r.reading[key] as number);
  const latest = new Map<string, SignalReading>();
  for (const r of past) {
    const prev = latest.get(r.term);
    if (!prev || r.captured_on > prev.captured_on) latest.set(r.term, r);
  }
  return [...latest.values()].map((r) => r.reading[key] as number);
}

/** The latest read per source and term: the two-week pool holds a row a day. */
function latestReads(pool: Signal[]): Signal[] {
  const latest = new Map<string, Signal>();
  for (const s of pool) {
    const key = `${s.source}|${s.metric_type}|${s.normalized_term}|${s.geo}`;
    const prev = latest.get(key);
    if (!prev || s.captured_at > prev.captured_at) latest.set(key, s);
  }
  return [...latest.values()];
}

/* -------------------------------- customer -------------------------------- */

function textsOf(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>)[field] : null))
    .filter((t): t is string => typeof t === "string");
}

/**
 * What people say on this term, in their own words: autocomplete phrasings,
 * Reddit and X posts, short-form captions, and the owner's and rivals' own
 * captions. Never the owner's ad copy; that is what they said, not the customer.
 */
function activityFor(signal: Signal, reads: Signal[], ctx: SignalContext, comments: SocialComment[] = []): CustomerInput["activity"] {
  const out: string[] = [];
  // Comments first: the customer's own words under the brand's (or a
  // rival's) post on this, or anywhere they name the term. These are the
  // only texts in the read that a specific brand's specific customers wrote.
  const ownOn = new Set(postsOnTerm(ctx.ownPosts, signal.term).map((p) => p.external_id));
  const rivalOn = new Set(postsOnTerm(ctx.rivalPosts, signal.term).map((p) => p.external_id));
  const tagged: CustomerInput["activity"] = [];
  const seenComment = new Set<string>();
  for (const c of comments) {
    const own = c.competitor_id === null;
    const underOn = own ? ownOn.has(c.post_external_id) : rivalOn.has(c.post_external_id);
    if (!underOn && postsOnTerm([{ caption: c.text }], signal.term).length === 0) continue;
    const text = c.text.replace(/\s+/g, " ").trim().slice(0, 200);
    const key = text.toLowerCase();
    if (!text || seenComment.has(key)) continue;
    seenComment.add(key);
    tagged.push({ text, from: "comment", own });
    if (tagged.length >= MAX_ACTIVITY) break;
  }
  for (const s of reads) {
    const raw = (s.raw ?? {}) as Record<string, unknown>;
    if (s.source === "google_suggest" && matchesTerm(s, signal)) {
      if (Array.isArray(raw.suggestions)) out.push(...raw.suggestions.filter((x): x is string => typeof x === "string"));
    } else if (s.source === "reddit") {
      // A Reddit row's term IS the post title; it belongs to this term when it
      // talks about it, or when it came back from a search for it (the body
      // is where the question actually gets asked).
      const searched = typeof raw.searched_for === "string" && normalizeTerm(raw.searched_for) === signal.normalized_term;
      if (searched || postsOnTerm([{ caption: s.term }], signal.term).length > 0) {
        out.push(typeof raw.body === "string" && raw.body ? `${s.term}. ${raw.body}` : s.term);
      }
    } else if (s.source === "x" && matchesTerm(s, signal)) {
      const top = raw.top as { text?: unknown } | null | undefined;
      if (typeof top?.text === "string") out.push(top.text);
    } else if (s.metric_type === "shortform_views" && matchesTerm(s, signal)) {
      out.push(...textsOf(raw.corpus, "caption"), ...textsOf(raw.corpus, "title"));
      for (const k of ["top", "breakout"]) {
        const card = raw[k] as { title?: unknown } | null | undefined;
        if (typeof card?.title === "string") out.push(card.title);
      }
    }
  }
  out.push(...postsOnTerm(ctx.ownPosts, signal.term).map((p) => p.caption));
  out.push(...postsOnTerm(ctx.rivalPosts, signal.term).map((p) => p.caption));
  const seen = new Set<string>(seenComment);
  const items: CustomerInput["activity"] = [...tagged];
  for (const raw of out) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    items.push({ text });
    if (items.length >= MAX_ACTIVITY) break;
  }
  return items;
}

/**
 * What customers say in reviews about this angle: the rivals' reviews that
 * mention the term and how many of those are one or two stars, against the
 * brand's own. Absent when no rival review mentions it.
 */
export function reviewsOnAngle(term: string, reviews: Review[], directIds: Set<string>): CompetitiveInput["reviews"] | undefined {
  const asPost = (r: Review) => ({ caption: r.text, review: r });
  const rival = reviews.filter((r) => r.competitor_id !== null && directIds.has(r.competitor_id));
  if (rival.length === 0) return undefined;
  const rivalOn = postsOnTerm(rival.map(asPost), term).map((p) => p.review);
  const own = reviews.filter((r) => r.competitor_id === null);
  const ownOn = postsOnTerm(own.map(asPost), term).map((p) => p.review);
  return {
    rivalsRead: new Set(rival.map((r) => r.competitor_id)).size,
    onTerm: rivalOn.length,
    lowOnTerm: rivalOn.filter((r) => r.rating <= LOW_STAR).length,
    ownOnTerm: own.length === 0 ? null : ownOn.length,
    ownLowOnTerm: own.length === 0 ? null : ownOn.filter((r) => r.rating <= LOW_STAR).length,
  };
}

/** Own posts on this term against the account's own median; null without a usual to beat. */
function ownEngagement(term: string, own: SocialPost[]): { on: number; ratio: number | null } {
  const on = postsOnTerm(own, term);
  const usual = median(own.map(engagementOf));
  if (on.length === 0 || usual <= 0) return { on: on.length, ratio: null };
  return { on: on.length, ratio: round3(median(on.map(engagementOf)) / usual) };
}

/**
 * Persona match: the brief's named target customer for now. When the brand's
 * own posts on the term exist, how the brand's real audience responded is
 * the stronger read and is blended in. "orders" is reserved for a store sync.
 */
function personaFor(
  term: string,
  brief: BusinessBrief | null,
  own: SocialPost[],
): { personaMatch: number | null; personaSource: CustomerInput["personaSource"] } {
  const fromBrief = audienceMatch(term, targetCustomerOf(brief)).score;
  if (own.length >= OWN_POSTS_MIN) {
    const { ratio } = ownEngagement(term, own);
    if (ratio !== null) {
      const engaged = clamp01(0.5 + (ratio - 1) * 0.5);
      return {
        personaMatch: round3(fromBrief === null ? engaged : 0.5 * fromBrief + 0.5 * engaged),
        personaSource: "engagement",
      };
    }
  }
  return { personaMatch: fromBrief, personaSource: fromBrief === null ? null : "brief" };
}

/* --------------------------------- culture -------------------------------- */

/**
 * Category growth. The honest read is a year of search volume across the
 * category's terms: every DataForSEO row carries its own year-on-year move
 * (raw.yoyPct, from twelve months of history), and the category's growth is
 * those moves weighted by volume. With fewer than three such terms it falls
 * back to this week's median move across short-form, Google Trends and
 * trend-board reads. Reddit and X are left out either way: an upvote
 * velocity is not a growth rate.
 */
export function categoryGrowth(reads: Signal[], now: Date): { pct: number; basis: "year" | "week" } | null {
  const yearly = reads
    .map((s) => {
      const raw = (s.raw ?? {}) as { yoyPct?: unknown };
      return { yoy: isNum(raw.yoyPct) ? raw.yoyPct : null, volume: isNum(s.value) ? s.value : 0 };
    })
    .filter((r): r is { yoy: number; volume: number } => r.yoy !== null && r.volume > 0);
  if (yearly.length >= MIN_GROWTH_READS) {
    const weight = yearly.reduce((a, r) => a + r.volume, 0);
    const pct = yearly.reduce((a, r) => a + r.yoy * r.volume, 0) / weight;
    return { pct: Math.round(pct * 10) / 10, basis: "year" };
  }
  const floor = now.getTime() - 7 * DAY_MS;
  const moves = reads
    .filter(
      (s) =>
        isNum(s.delta_pct) &&
        Date.parse(s.captured_at) >= floor &&
        (s.metric_type === "shortform_views" ||
          s.source === "google_trends" ||
          (s.metric_type === "conversation" && s.source === "tiktok")),
    )
    .map((s) => s.delta_pct as number);
  return moves.length >= MIN_GROWTH_READS ? { pct: Math.round(median(moves) * 10) / 10, basis: "week" } : null;
}

/* ------------------------------ monthly history ----------------------------- */

/** How many complete months a seasonal or year-on-year read needs. */
const MONTHLY_MIN_MONTHS = 8;
const MONTHLY_MIN_SPAN_DAYS = 300;

/**
 * The term's monthly search volumes, one per complete month, from the
 * series table. DataForSEO stores twelve months as points on the first of
 * each month; daily index and view points share the table, so a monthly
 * point is one dated the first with a value above any index (100). The
 * current month is dropped: it is partial, and it is the one month a daily
 * short-form point can also land on the first of.
 */
export function monthlyVolumes(points: DailyPoint[], now: Date): { month: string; value: number }[] {
  const thisMonth = dayOf(now).slice(0, 7);
  const byMonth = new Map<string, number>();
  for (const p of points) {
    if (!Number.isFinite(p.value) || p.value <= 100 || !/^\d{4}-\d{2}-01$/.test(p.day)) continue;
    const month = p.day.slice(0, 7);
    if (month >= thisMonth) continue;
    byMonth.set(month, Math.max(byMonth.get(month) ?? 0, p.value));
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonths(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + by, 1)));
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Is this the term's usual active window, from its monthly search volumes:
 * this month and next, a year ago, against that year's monthly norm. An ad
 * runs for weeks, so the coming month counts as much as the current one.
 * Null under eight complete months spanning most of a year.
 */
export function seasonalFromMonthly(points: DailyPoint[], now: Date): CultureInput["seasonal"] {
  const months = monthlyVolumes(points, now);
  if (months.length < MONTHLY_MIN_MONTHS) return null;
  const first = Date.parse(`${months[0].month}-01`);
  const last = Date.parse(`${months[months.length - 1].month}-01`);
  if (last - first < MONTHLY_MIN_SPAN_DAYS * DAY_MS) return null;
  const byMonth = new Map(months.map((m) => [m.month, m.value]));
  const thisMonth = monthKey(now);
  const window = [shiftMonths(thisMonth, -12), shiftMonths(thisMonth, -11)]
    .map((m) => byMonth.get(m))
    .filter((v): v is number => typeof v === "number");
  if (window.length === 0) return null;
  const norm = median(months.slice(-12).map((m) => m.value));
  if (norm <= 0) return null;
  const ratio = window.reduce((a, v) => a + v, 0) / window.length / norm;
  const fit = ratio <= 1 ? Math.max(10, 50 - ((1 - ratio) / 0.4) * 40) : Math.min(95, 50 + ((ratio - 1) / 0.5) * 45);
  const diff = Math.round(Math.abs(ratio - 1) * 100);
  const name = MONTH_NAMES[now.getUTCMonth()];
  const label =
    diff < 8
      ? `Last ${name} ran about at the term's yearly norm`
      : `Last ${name} ran ${diff}% ${ratio > 1 ? "above" : "below"} the term's yearly norm`;
  return { inWindow: ratio >= 1.15, daysOut: null, label, fit: Math.round(fit * 10) / 10 };
}

/**
 * The term's searches, the last three complete months against the same
 * three a year earlier. Null unless both windows are fully present.
 */
export function yearOverYearFromMonthly(points: DailyPoint[], now: Date): number | null {
  const byMonth = new Map(monthlyVolumes(points, now).map((m) => [m.month, m.value]));
  const thisMonth = monthKey(now);
  const recent = [1, 2, 3].map((n) => byMonth.get(shiftMonths(thisMonth, -n)));
  const prior = [13, 14, 15].map((n) => byMonth.get(shiftMonths(thisMonth, -n)));
  if (recent.some((v) => v === undefined) || prior.some((v) => v === undefined)) return null;
  const a = (recent as number[]).reduce((s, v) => s + v, 0);
  const b = (prior as number[]).reduce((s, v) => s + v, 0);
  if (b <= 0) return null;
  return Math.round(((a - b) / b) * 100);
}

/**
 * Is this the term's usual active window, read from a year of its own
 * history: how the same five weeks ran last year against that year's
 * monthly norm. A term whose Septembers run 40% above its norm is in season
 * whatever the category calendar says. Null under a year of readable data.
 */
export function seasonalFromSeries(points: DailyPoint[], now: Date): CultureInput["seasonal"] {
  const xs = points.filter((p) => Number.isFinite(p.value) && /^\d{4}-\d{2}-\d{2}$/.test(p.day)).sort((a, b) => a.day.localeCompare(b.day));
  if (xs.length < SEASON_MIN_POINTS) return null;
  const first = Date.parse(xs[0].day);
  const last = Date.parse(xs[xs.length - 1].day);
  if (last - first < SEASON_MIN_SPAN_DAYS * DAY_MS) return null;

  const yearAgo = now.getTime() - 365 * DAY_MS;
  const window = xs.filter((p) => {
    const t = Date.parse(p.day);
    return t >= yearAgo - 14 * DAY_MS && t <= yearAgo + 21 * DAY_MS;
  });
  if (window.length < 2) return null;

  const months = new Map<string, number[]>();
  for (const p of xs) {
    const t = Date.parse(p.day);
    if (t < now.getTime() - 400 * DAY_MS || t > now.getTime() - 30 * DAY_MS) continue;
    const key = p.day.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p.value]);
  }
  if (months.size < SEASON_MIN_MONTHS) return null;
  const norm = median([...months.values()].map((vs) => vs.reduce((a, b) => a + b, 0) / vs.length));
  if (norm <= 0) return null;
  const ratio = window.reduce((a, p) => a + p.value, 0) / window.length / norm;

  // 0.6 or less is 10, the norm is 50, 1.5 or more is 95.
  const fit = ratio <= 1 ? Math.max(10, 50 - ((1 - ratio) / 0.4) * 40) : Math.min(95, 50 + ((ratio - 1) / 0.5) * 45);
  const diff = Math.round(Math.abs(ratio - 1) * 100);
  const label =
    diff < 8
      ? "This time last year ran about at the term's yearly norm"
      : `This time last year ran ${diff}% ${ratio > 1 ? "above" : "below"} the term's yearly norm`;
  return { inWindow: ratio >= 1.15, daysOut: null, label, fit: Math.round(fit * 10) / 10 };
}

/** The kind of level a signal row's value is, for the absolute volume curve. */
export function levelKindOf(metricType: string | null): LevelKind {
  switch (metricType) {
    case "search_volume":
      return "search_volume";
    case "search_interest":
      return "search_interest";
    case "shortform_views":
      return "shortform_views";
    case "conversation":
    case "news_coverage":
    case "search_intent":
      return "conversation";
    default:
      return "index";
  }
}

/** Shares and saves per view on the term's short-form, the strongest read
 * across its sources this fortnight. Null when no short-form read carries one. */
export function actionPctFor(signal: Signal, reads: Signal[]): number | null {
  let best: { pct: number; views: number } | null = null;
  for (const s of reads) {
    if (s.metric_type !== "shortform_views" || !matchesTerm(s, signal)) continue;
    const raw = (s.raw ?? {}) as { actionPct?: unknown; views?: unknown };
    const views = isNum(raw.views) ? raw.views : isNum(s.value) ? s.value : 0;
    // One seven-second video with no shares is not a read on the term.
    if (!isNum(raw.actionPct) || raw.actionPct < 0 || views < MIN_ACTION_VIEWS) continue;
    if (best === null || views > best.views) best = { pct: raw.actionPct, views };
  }
  return best?.pct ?? null;
}

/** Is this the term's (or the category's) active window. Null when the
 * category has no calendar at all, which is unknown, not "off season". */
function seasonalFor(term: string, category: string, now: Date): CultureInput["seasonal"] {
  const year = upcomingMoments(category, now, 366);
  if (year.length === 0) return null;
  const want = tokens(term);
  const named = year.find((m) => [...tokens(m.label)].some((t) => want.has(t)));
  const moment = named ?? year.find((m) => m.prepNow) ?? year[0];
  return { inWindow: moment.prepNow, daysOut: moment.daysOut, label: moment.label };
}

/* ------------------------------- competitive ------------------------------ */

interface StoredAd {
  headline?: unknown;
  snippet?: unknown;
  runningDays?: unknown;
}

/** A Meta read stores `ads`; a Google Transparency read stores `sample`,
 * whose first and last shown dates give the running days. */
function adsOf(read: CompetitorRead): StoredAd[] {
  const raw = read.raw as { ads?: unknown; sample?: unknown } | null;
  if (Array.isArray(raw?.ads)) return raw.ads as StoredAd[];
  if (!Array.isArray(raw?.sample)) return [];
  return (raw.sample as { snippet?: unknown; firstShown?: unknown; lastShown?: unknown }[]).map((a) => {
    const first = typeof a.firstShown === "string" ? Date.parse(a.firstShown) : NaN;
    const last = typeof a.lastShown === "string" ? Date.parse(a.lastShown) : NaN;
    const days = Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, Math.round((last - first) / DAY_MS)) : null;
    return { snippet: a.snippet, runningDays: days };
  });
}

const adCaption = (a: StoredAd) =>
  [a.headline, a.snippet].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" ");

function competitiveFor(term: string, ctx: GradeContext): CompetitiveInput {
  const { direct } = ctx.signals;
  const now = ctx.now.getTime();
  const ageDays = (iso: string | null) => (iso ? (now - Date.parse(iso)) / DAY_MS : Infinity);

  const readsBy = new Map<string, CompetitorRead[]>();
  for (const r of ctx.adReads) readsBy.set(r.competitor_id, [...(readsBy.get(r.competitor_id) ?? []), r]);

  // A rival is read when at least one of their ADS was actually seen WITH
  // WORDS. The Competitive signal is "what your competitors are running":
  // their organic posts used to count as a read too, and a brand whose
  // rivals' ads were never fetched scored whitespace 100 at high confidence
  // off their Instagram captions. Then Google's Transparency Center came
  // back with five rivals' image and video ads and no text at all, and the
  // same "none of the 5 competitors run this angle" printed at high
  // confidence off ads nobody could read (Crown Affair, 2026-09-15). An ad
  // with no copy proves the rival advertises; it cannot say on what. Posts
  // still feed the evidence lines and the campaign brief; they do not grade
  // the signal. An ad read that came back empty (no ads, or a read that
  // failed upstream and stored nothing) is not a read either, or every
  // quiet week would score as open whitespace.
  const read = direct.filter((c) => (readsBy.get(c.id) ?? []).some((r) => adsOf(r).some((a) => adCaption(a).length > 0)));
  let evidence = 0;
  let onNow = 0;
  let onPrior = 0;
  let onAngle = 0;
  let weak = 0;
  for (const c of read) {
    // One entry per distinct ad across every read in the window, with where
    // it was last seen, so an ad missing from the latest read shows as pulled.
    const reads = readsBy.get(c.id) ?? [];
    const latestAt = reads.length > 0 ? reads[reads.length - 1].captured_at : null;
    const ads = new Map<string, { lastSeen: string; firstSeen: string; runningDays: number | null }>();
    const seen = new Set<string>();
    for (const r of reads) {
      for (const a of adsOf(r)) {
        const caption = adCaption(a);
        // An image-only ad is still an ad they are running, but not one the
        // whitespace call can rest on: it neither counts as evidence read
        // nor matches the angle.
        if (!caption) continue;
        seen.add(caption.toLowerCase().slice(0, 200));
        if (postsOnTerm([{ caption }], term).length === 0) continue;
        const key = caption.toLowerCase().slice(0, 200);
        const days = isNum(a.runningDays) ? a.runningDays : null;
        const prev = ads.get(key);
        ads.set(key, {
          firstSeen: prev?.firstSeen ?? r.captured_at,
          lastSeen: r.captured_at,
          runningDays: days === null ? (prev?.runningDays ?? null) : Math.max(days, prev?.runningDays ?? 0),
        });
      }
    }
    const adsOn = [...ads.values()];
    evidence += seen.size;

    const isNow = adsOn.some((a) => a.lastSeen === latestAt && ageDays(latestAt) <= NOW_DAYS);
    // Prior: an ad seen 15-45 days ago, or one that has been running since
    // before the current two weeks began.
    const isPrior = adsOn.some(
      (a) => ageDays(a.firstSeen) > NOW_DAYS || (a.runningDays !== null && a.runningDays + ageDays(a.lastSeen) > NOW_DAYS),
    );
    if (isNow) onNow += 1;
    if (isPrior) onPrior += 1;

    onAngle += adsOn.length;
    // Weak: pulled inside a week of starting. The only performance read the
    // Ad Library allows for a commercial advertiser.
    weak += adsOn.filter((a) => a.lastSeen !== latestAt && a.runningDays !== null && a.runningDays < WEAK_AD_DAYS).length;
  }

  return {
    competitorsConnected: direct.length,
    competitorsRead: read.length,
    evidenceItems: evidence,
    rivalsOnAngleNow: onNow,
    rivalsOnAnglePrior: read.length === 0 ? null : onPrior,
    rivalAdsOnAngle: onAngle,
    weakRivalAds: weak,
    reviews: reviewsOnAngle(term, ctx.reviews, new Set(direct.map((c) => c.id))),
    // Rivals whose ads were seen but carry no words: said on the note, so
    // "their ads haven't been read" is never printed over five image ads.
    rivalsWithWordlessAds: direct.filter(
      (c) => !read.includes(c) && (readsBy.get(c.id) ?? []).some((r) => adsOf(r).length > 0),
    ).length,
    settingsHref: SETTINGS_HREF,
  };
}

/* ---------------------------------- brand --------------------------------- */

function rowCtr(r: AdHistory): number | null {
  if (r.impressions && r.clicks !== null) return r.clicks / r.impressions;
  return r.ctr;
}

/** Every delivered ad's CTR against the account: what "a normal ad for this
 * brand" looks like, before any stored readings exist. */
function perAdLifts(rows: AdHistory[]): number[] {
  const account = readAdHistory(rows).accountCtr;
  if (!account) return [];
  return rows
    .filter((r) => (r.impressions ?? 0) >= MIN_AD_IMPRESSIONS)
    .map(rowCtr)
    .filter(isNum)
    .map((ctr) => round3(ctr / account));
}

/** The term's own past ads against the account, only when there was enough
 * delivery to compare (historyOnTerm says so in its reason). */
function similarLift(rows: AdHistory[], term: string): { count: number; lift: number | null } {
  if (rows.length === 0) return { count: 0, lift: null };
  const h = historyOnTerm(rows, term);
  const account = readAdHistory(rows).accountCtr;
  const compared = /above|below|about even/.test(h.reason);
  return { count: h.ads, lift: compared && isNum(h.ctr) && account ? round3(h.ctr / account) : null };
}

/** Does the matched item sit where the rest of the menu sits. A $400 machine
 * on a menu of $5 drinks is a different buyer. Null without prices to compare. */
function priceBandMatch(signal: Signal, services: Service[]): boolean | null {
  const matched = matchService(signal, services).service;
  const prices = services.filter((s) => s.is_active && isNum(s.price_cents) && s.price_cents > 0).map((s) => s.price_cents as number);
  if (!matched || !isNum(matched.price_cents) || matched.price_cents <= 0 || prices.length < 2) return null;
  const mid = median(prices);
  return matched.price_cents >= mid / 2.5 && matched.price_cents <= mid * 2.5;
}

/** The matched item's stock as the catalog last said; null when unmatched or unread. */
function stockOf(signal: Signal, services: Service[]): boolean | null {
  const matched = matchService(signal, services).service;
  return matched && typeof matched.in_stock === "boolean" ? matched.in_stock : null;
}

/* --------------------------------- gather --------------------------------- */

export async function gatherSignalInputs(
  repo: Repo,
  business: Business,
  signal: Signal,
  ctx: GradeContext,
  opts: GatherOptions = {},
): Promise<GatheredInputs> {
  const today = dayOf(ctx.now);
  const reads = latestReads(ctx.pool);
  // A year of the term's history is read once: the last 90 days are the
  // lifecycle and velocity series, the whole year is the seasonal read.
  const rawSeries = await safe(repo.getSeries(signal.normalized_term, signal.geo, SEASON_DAYS), []);
  const yearSeries: DailyPoint[] = indexSeries(rawSeries)
    .map((p) => ({ day: p.day, value: p.value }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const seriesFloor = dayOf(new Date(ctx.now.getTime() - BASELINE_DAYS * DAY_MS));
  const series = yearSeries.filter((p) => p.day >= seriesFloor);

  // Customer. A level is only comparable to levels of the same kind: 14,800
  // monthly searches and a Trends 63 are not one scale, so each metric keeps
  // its own reading key. An evergreen term with no stored value reads its
  // level off the last week of its index series.
  const lastWeek = series.slice(-7);
  const level = isNum(signal.value)
    ? signal.value
    : lastWeek.length > 0
      ? round3(lastWeek.reduce((s, p) => s + p.value, 0) / lastWeek.length)
      : null;
  const levelKey = `level_${isNum(signal.value) ? signal.metric_type : "series"}`;
  // A series-derived level is the index the series keeps (0-100) unless the
  // term only ever had raw volumes stored.
  const levelKind: LevelKind = isNum(signal.value)
    ? levelKindOf(signal.metric_type)
    : lastWeek.every((p) => p.value <= 100)
      ? "index"
      : "search_volume";
  const persona = personaFor(signal.term, ctx.brief, ctx.signals.ownPosts);
  const customer: CustomerInput = {
    term: signal.term,
    personaMatch: persona.personaMatch,
    personaSource: persona.personaSource,
    level,
    levelKind,
    actionPct: actionPctFor(signal, reads),
    levelBaseline: baselineOf(ctx.baselines.customer, levelKey, today),
    activity: activityFor(signal, reads, ctx.signals, ctx.comments),
    series,
  };

  const growth = categoryGrowth(reads, ctx.now);
  // Every point the term has, monthly volumes included: the index filter
  // above keeps the daily shape for lifecycle and velocity, and the monthly
  // volumes are what a year's season and year-on-year move are read from.
  const allPoints: DailyPoint[] = rawSeries.map((p) => ({ day: p.day, value: p.value }));
  const culture: CultureInput = {
    term: signal.term,
    category: business.category,
    categoryGrowthPct: growth?.pct ?? null,
    categoryGrowthBasis: growth?.basis,
    yearOverYearPct: yearOverYearFromMonthly(allPoints, ctx.now),
    categoryGrowthBaseline: baselineOf(ctx.baselines.culture, "growthPct", today),
    // The term's own year beats the category calendar when it is readable:
    // a year of daily points first, twelve months of search volume next.
    seasonal:
      seasonalFromSeries(yearSeries, ctx.now) ??
      seasonalFromMonthly(allPoints, ctx.now) ??
      seasonalFor(signal.term, business.category, ctx.now),
    series,
  };

  const competitive = competitiveFor(signal.term, ctx);

  // Brand. The lift baseline is every past ad's CTR against the account, plus
  // the latest stored lift per term: repeating the same history's lift every
  // day would drown the baseline in one number.
  const history = ctx.signals.history;
  const similar = similarLift(history, signal.term);
  const own = ownEngagement(signal.term, ctx.signals.ownPosts);
  const fit = isNum(opts.fit) ? clamp01(opts.fit) : matchService(signal, ctx.services).score;
  const brand: BrandInput = {
    adHistoryAds: history.length,
    similarAdsCount: similar.count,
    similarAdsLift: similar.lift,
    liftBaseline: [...perAdLifts(history), ...baselineOf(ctx.baselines.brand, "lift", today, { latestPerTerm: true })],
    economics: {
      fit,
      priceBandMatch: priceBandMatch(signal, ctx.services),
      // Stock from the store's public catalog, refreshed daily
      // (lib/intel/deep-reads.ts); null until read. Cost has no feed yet.
      inStock: stockOf(signal, ctx.services),
      marginOk: null,
    },
    organic: {
      posts: ctx.signals.ownPosts.length,
      onTermPosts: own.on,
      engagementRatio: ctx.signals.ownPosts.length >= OWN_POSTS_MIN ? own.ratio : null,
    },
    settingsHref: SETTINGS_HREF,
  };

  const readings: NewSignalReading[] = [];
  if (level !== null) {
    readings.push({
      business_id: business.id,
      captured_on: today,
      signal: "customer",
      term: signal.normalized_term,
      reading: { [levelKey]: level, personaMatch: persona.personaMatch },
    });
  }
  if (growth !== null) {
    readings.push({ business_id: business.id, captured_on: today, signal: "culture", term: CATEGORY_TERM, reading: { growthPct: growth.pct } });
  }
  if (similar.lift !== null) {
    readings.push({ business_id: business.id, captured_on: today, signal: "brand", term: signal.normalized_term, reading: { lift: similar.lift } });
  }

  return { customer, culture, competitive, brand, readings };
}

/** One row per (day, signal, term): a batch upsert cannot touch a row twice. */
export function dedupeReadings(rows: NewSignalReading[]): NewSignalReading[] {
  const byKey = new Map<string, NewSignalReading>();
  for (const r of rows) byKey.set(`${r.business_id}|${r.captured_on ?? ""}|${r.signal}|${r.term}`, r);
  return [...byKey.values()];
}
