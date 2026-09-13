/**
 * Where each of the four signals' evidence lives, turned into the inputs the
 * pure scorers take (lib/scoring/model.ts).
 *
 * The scorers never touch the database; this is the only file that knows a
 * Customer volume reading is a signal's value, that Reddit titles and Google
 * autocomplete are what customers say, that a rival's pulled ad lives in an
 * older competitor read, and that a baseline is the signal_readings table.
 *
 * Nothing here invents a number. Stock and margin have no data source yet, so
 * they are null; a baseline with nothing in it is an empty array, and the
 * scorer decides what that does to its confidence.
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
  Service,
  Signal,
  SignalReading,
  SocialPost,
} from "@/lib/db/types";
import { indexSeries } from "@/lib/demand/series";
import { loadSignalContext, type SignalContext } from "@/lib/recommend/four-signals";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { audienceMatch, matchService, tokens } from "@/lib/scoring";
import { engagementOf, postsOnTerm } from "@/lib/social/read";

import type { BrandInput, CompetitiveInput, CultureInput, CustomerInput, DailyPoint, SignalName } from "./model";

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
const MAX_ACTIVITY = 40;
/** Category growth needs a few reads before a median means anything. */
const MIN_GROWTH_READS = 3;
/** Culture growth is read once per category, not per term. */
export const CATEGORY_TERM = "_category";

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
  const [signals, reads, customer, culture, competitive, brand] = await Promise.all([
    given.signals ?? loadSignalContext(repo, business, brief, pool),
    safe(repo.listCompetitorReads(business.id, { sinceDays: PRIOR_DAYS }), [] as CompetitorRead[]),
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
    adReads: reads
      .filter((r) => r.kind === "ads" && direct.has(r.competitor_id))
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
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
function activityFor(signal: Signal, reads: Signal[], ctx: SignalContext): { text: string }[] {
  const out: string[] = [];
  for (const s of reads) {
    const raw = (s.raw ?? {}) as Record<string, unknown>;
    if (s.source === "google_suggest" && matchesTerm(s, signal)) {
      if (Array.isArray(raw.suggestions)) out.push(...raw.suggestions.filter((x): x is string => typeof x === "string"));
    } else if (s.source === "reddit") {
      // A Reddit row's term IS the post title; it belongs to this term when it
      // talks about it.
      if (postsOnTerm([{ caption: s.term }], signal.term).length > 0) out.push(s.term);
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
  const seen = new Set<string>();
  const items: { text: string }[] = [];
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
 * Category growth this week: the median move of this category's short-form,
 * Google Trends and trend-board reads. Reddit and X are left out: an upvote
 * velocity is not a growth rate.
 */
function categoryGrowth(reads: Signal[], now: Date): number | null {
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
  return moves.length >= MIN_GROWTH_READS ? Math.round(median(moves) * 10) / 10 : null;
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

function adsOf(read: CompetitorRead): StoredAd[] {
  const ads = (read.raw as { ads?: unknown } | null)?.ads;
  return Array.isArray(ads) ? (ads as StoredAd[]) : [];
}

const adCaption = (a: StoredAd) =>
  [a.headline, a.snippet].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" ");

function competitiveFor(term: string, ctx: GradeContext): CompetitiveInput {
  const { direct, rivalPosts } = ctx.signals;
  const now = ctx.now.getTime();
  const ageDays = (iso: string | null) => (iso ? (now - Date.parse(iso)) / DAY_MS : Infinity);

  const postsBy = new Map<string, SocialPost[]>();
  for (const p of rivalPosts) if (p.competitor_id) postsBy.set(p.competitor_id, [...(postsBy.get(p.competitor_id) ?? []), p]);
  const readsBy = new Map<string, CompetitorRead[]>();
  for (const r of ctx.adReads) readsBy.set(r.competitor_id, [...(readsBy.get(r.competitor_id) ?? []), r]);

  const read = direct.filter((c) => postsBy.has(c.id) || readsBy.has(c.id));
  let onNow = 0;
  let onPrior = 0;
  let onAngle = 0;
  let weak = 0;
  for (const c of read) {
    const posts = postsBy.get(c.id) ?? [];
    const postsOn = postsOnTerm(posts, term);
    const usual = median(posts.map(engagementOf));

    // One entry per distinct ad across every read in the window, with where
    // it was last seen, so an ad missing from the latest read shows as pulled.
    const reads = readsBy.get(c.id) ?? [];
    const latestAt = reads.length > 0 ? reads[reads.length - 1].captured_at : null;
    const ads = new Map<string, { lastSeen: string; firstSeen: string; runningDays: number | null }>();
    for (const r of reads) {
      for (const a of adsOf(r)) {
        const caption = adCaption(a);
        if (!caption || postsOnTerm([{ caption }], term).length === 0) continue;
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

    const isNow =
      postsOn.some((p) => ageDays(p.posted_at ?? p.captured_at) <= NOW_DAYS) ||
      adsOn.some((a) => a.lastSeen === latestAt && ageDays(latestAt) <= NOW_DAYS);
    // Prior: posted 15-45 days ago, or an ad seen then, or an ad that has
    // been running since before the current two weeks began.
    const isPrior =
      postsOn.some((p) => ageDays(p.posted_at ?? p.captured_at) > NOW_DAYS) ||
      adsOn.some(
        (a) =>
          ageDays(a.firstSeen) > NOW_DAYS ||
          (a.runningDays !== null && a.runningDays + ageDays(a.lastSeen) > NOW_DAYS),
      );
    if (isNow) onNow += 1;
    if (isPrior) onPrior += 1;

    onAngle += postsOn.length + adsOn.length;
    weak += adsOn.filter((a) => a.lastSeen !== latestAt && a.runningDays !== null && a.runningDays < WEAK_AD_DAYS).length;
    if (usual > 0) weak += postsOn.filter((p) => engagementOf(p) < usual / 2).length;
  }

  return {
    competitorsConnected: direct.length,
    competitorsRead: read.length,
    rivalsOnAngleNow: onNow,
    rivalsOnAnglePrior: read.length === 0 ? null : onPrior,
    rivalAdsOnAngle: onAngle,
    weakRivalAds: weak,
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
  const rawSeries = await safe(repo.getSeries(signal.normalized_term, signal.geo, BASELINE_DAYS), []);
  const series: DailyPoint[] = indexSeries(rawSeries)
    .map((p) => ({ day: p.day, value: p.value }))
    .sort((a, b) => a.day.localeCompare(b.day));

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
  const persona = personaFor(signal.term, ctx.brief, ctx.signals.ownPosts);
  const customer: CustomerInput = {
    term: signal.term,
    personaMatch: persona.personaMatch,
    personaSource: persona.personaSource,
    level,
    levelBaseline: baselineOf(ctx.baselines.customer, levelKey, today),
    activity: activityFor(signal, reads, ctx.signals),
    series,
  };

  const growth = categoryGrowth(reads, ctx.now);
  const culture: CultureInput = {
    term: signal.term,
    category: business.category,
    categoryGrowthPct: growth,
    categoryGrowthBaseline: baselineOf(ctx.baselines.culture, "growthPct", today),
    seasonal: seasonalFor(signal.term, business.category, ctx.now),
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
      // No inventory or cost feed yet: unknown, never assumed.
      inStock: null,
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
    readings.push({ business_id: business.id, captured_on: today, signal: "culture", term: CATEGORY_TERM, reading: { growthPct: growth } });
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
