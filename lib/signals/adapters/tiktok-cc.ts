import { isModelConfigured } from "@/lib/env";

import { classifyTerm } from "../category-terms";
import { normalizeTerm } from "../normalize";
import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";

/**
 * TikTok Creative Center trending hashtags — the public per-industry trend
 * board at ads.tiktok.com/business/creativecenter. Its backing endpoint
 * (CreativeOne/KnowledgeAPI/GetHashtagList) answers plain JSON POSTs with no
 * auth: top trending hashtags per industry with post counts, video views,
 * and a normalized 7-day popularity curve. Anonymous access caps each query
 * at the top ~3 rows, so we query once per mapped industry — TikTok's own
 * industry classification beats lexicon guessing. Unofficial surface like
 * the Trends interest-over-time adapter: same circuit-breaker treatment,
 * degrades instead of crashing the run.
 */

const API_URL = "https://ads.tiktok.com/CreativeOne/KnowledgeAPI/GetHashtagList";

const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/plain, */*",
  "agw-js-conv": "str",
  referer: "https://ads.tiktok.com/creative/creativecenter/trends/hashtag",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
};

/** TikTok industry ids (labels verified against their own bundle) → TRND
 * categories. Industries with no clean category mapping are not queried. */
export const INDUSTRY_TO_CATEGORY: Record<string, string> = {
  "27000000000": "Restaurants & cafés", // Food & Beverage
  "14000000000": "Health & beauty", // Beauty & Personal Care
  "28000000000": "Fitness studios", // Sports & Outdoor
  "11000000000": "Auto services", // Vehicle & Transportation
  "21000000000": "Home services", // Home Improvement
  "22000000000": "Retail & boutiques", // Apparel & Accessories
  "29000000000": "Dental & wellness", // Health
};

interface CcCurvePoint {
  timestamp: string;
  value: number;
}
interface CcHashtag {
  hashtagName?: string;
  publishCnt?: string;
  vv?: string;
  rankIndex?: string;
  industryIDs?: string[];
  popularityCurve?: CcCurvePoint[];
}
export interface CcPayload {
  BaseResp?: { StatusCode?: number };
  items?: CcHashtag[];
}

/**
 * How much louder this hashtag got across the window.
 *
 * The curve is normalized 0–100 against the hashtag's own peak, and the
 * trailing point is usually 0 (today, still filling). Reading first → last
 * on that shape made every hashtag on the board report +100%: the first
 * point is frequently 0 or near it, and dividing by `Math.max(first, 1)`
 * turned "started from nothing" into "up infinity", clamped. A board where
 * every row rises the same amount ranks nothing.
 *
 * So: compare the tail of the window against the stretch before it, the way
 * the search series does — halves for a 7-day curve, sevenths for a 30-day
 * one. When the earlier stretch is genuinely flat at zero the honest answer
 * is "no read", not a triple-digit spike.
 */
export function curveDelta(curve: CcCurvePoint[] | undefined): number | null {
  const points = [...(curve ?? [])];
  while (points.length > 0 && points[points.length - 1].value === 0) points.pop();
  if (points.length < 4) return null;
  const span = points.length >= 14 ? 7 : Math.floor(points.length / 2);
  const mean = (xs: CcCurvePoint[]) => xs.reduce((sum, p) => sum + p.value, 0) / xs.length;
  const recent = mean(points.slice(-span));
  const before = mean(points.slice(-span * 2, -span));
  if (before <= 0.5) return null;
  const pct = ((recent - before) / before) * 100;
  return Math.max(-100, Math.min(100, Math.round(pct)));
}

/**
 * Does this board row say anything about what the industry SELLS?
 *
 * TikTok's industry boards rank whatever is nationally loud among that
 * industry's advertisers, which during a holiday week is just the holiday.
 * The Food & Beverage board on 2026-09-11 was #happylaborday, #ldw and
 * #laborday2026 — three spellings of one thing, none of them about food,
 * all three filed as "Restaurants & cafés" trends. Ranked as category
 * demand, that is the output of a scraper, not an analyst.
 *
 * These rows are not worthless — Labor Day weekend is a real demand moment
 * for a restaurant — so they are marked rather than dropped, and the
 * insight layer frames them as a national moment instead of a category
 * trend.
 *
 * This lexicon check is the FALLBACK, used only when the model is unconfigured.
 * It is deliberately conservative because it is weak: a live board read
 * showed it marking "#sorority recruitment outfits" on the Home Improvement
 * board as on-topic (it hit the apparel lexicon, for a different category)
 * while missing "#leaf blower maintenance" on that same board. So it only
 * answers for the category the row was actually filed under, and anything
 * it cannot place is left on-topic rather than wrongly demoted — a missed
 * demotion costs a sentence of framing, a wrong one buries a real trend.
 */
export function isCategoryBearing(term: string, category: string): boolean {
  const hit = classifyTerm(term);
  return hit === null || hit === category;
}

/**
 * Collapse spellings of one trend to the strongest row.
 *
 * The board has three slots per query, so #happylaborday + #ldw +
 * #laborday2026 costs the entire query and returns one fact. Two rows are
 * the same trend when one's compacted letters contain the other's, which
 * catches the abbreviation/suffix/year family ("laborday" ⊂ "laborday2026",
 * "laborday" ⊂ "happylaborday") without a thesaurus. Order is preserved, so
 * whichever row TikTok ranked higher is the one kept.
 */
export function collapseVariants<T extends { term: string }>(rows: T[]): T[] {
  const kept: { row: T; key: string }[] = [];
  for (const row of rows) {
    const key = row.term.toLowerCase().replace(/[^a-z]/g, "");
    if (key.length < 3) continue;
    const dupe = kept.some((k) => k.key.includes(key) || key.includes(k.key));
    if (!dupe) kept.push({ row, key });
  }
  return kept.map((k) => k.row);
}

/** Pure mapper — unit-tested against a captured fixture. `termFor` swaps the
 * raw hashtag slug for a readable trend phrase; the slug stays in `raw`. */
export function ccSignals(
  payload: CcPayload,
  category: string,
  geo: string,
  windowDays: number,
  termFor: (hashtag: string) => string = (h) => h,
  onTopicFor: ((hashtag: string, term: string, category: string) => boolean) | null = null,
): RawSignal[] {
  if (payload.BaseResp?.StatusCode !== 0) return [];
  return (payload.items ?? [])
    .filter((i) => typeof i.hashtagName === "string" && i.hashtagName.length > 1)
    .map((i) => {
      const term = termFor(String(i.hashtagName));
      return {
        source: "tiktok" as const,
        term,
        category,
        geo,
        metric_type: "conversation",
        value: Number(i.publishCnt) || null,
        delta_pct: curveDelta(i.popularityCurve),
        window_days: windowDays,
        // Whether this row is about the industry at all, or just what the
        // whole country was posting that week. The insight layer frames the
        // two differently; nothing is dropped on it.
        raw: {
          ...i,
          categoryBearing: onTopicFor
            ? onTopicFor(String(i.hashtagName), term, category)
            : isCategoryBearing(term, category),
        },
      };
    });
}

export function ccSeries(
  payload: CcPayload,
  geo: string,
  termFor: (hashtag: string) => string = (h) => h,
): RawSeriesPoint[] {
  if (payload.BaseResp?.StatusCode !== 0) return [];
  const out: RawSeriesPoint[] = [];
  for (const item of payload.items ?? []) {
    if (!item.hashtagName) continue;
    const term = normalizeTerm(termFor(item.hashtagName));
    for (const p of item.popularityCurve ?? []) {
      const ms = Number(p.timestamp) * 1000;
      if (!Number.isFinite(ms) || ms <= 0) continue;
      out.push({
        term,
        geo,
        day: new Date(ms).toISOString().slice(0, 10),
        value: Math.round(p.value),
      });
    }
  }
  return out;
}

export function createTiktokCcAdapter(opts: {
  /** Injectable for tests; defaults to the model pass when configured. */
  humanize?: (items: { hashtag: string; category: string }[]) => Promise<{ term: string; onTopic: boolean }[]>;
  /** Injectable for tests; defaults to the hardened fetchJson. */
  fetchJson?: typeof fetchJson;
} = {}): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("tiktok_cc");
  const cache = new Map<string, CcPayload>();
  // hashtag slug → readable trend phrase, built once per run over every
  // industry's items so signals and series always share the same term.
  const termMap = new Map<string, string>();
  // hashtag slug → whether the row is about what its board's industry sells.
  // Judged by the same call that humanizes, which is the only place that
  // knows both the readable phrase and the industry it came from.
  const topicMap = new Map<string, boolean>();
  let termsResolved = false;

  const resolveTerms = async (boards: { payload: CcPayload; category: string }[]) => {
    if (termsResolved) return;
    termsResolved = true;
    const byName = new Map<string, string>();
    for (const { payload, category } of boards) {
      for (const i of payload.items ?? []) {
        if (typeof i.hashtagName === "string" && i.hashtagName.length > 1 && !byName.has(i.hashtagName)) {
          byName.set(i.hashtagName, category);
        }
      }
    }
    const items = [...byName.entries()].map(([hashtag, category]) => ({ hashtag, category }));
    if (items.length === 0) return;
    try {
      const humanize =
        opts.humanize ??
        (isModelConfigured
          ? (await import("@/lib/ai/openai")).humanizeTrendTerms
          : null);
      if (!humanize) return;
      const reads = await humanize(items);
      items.forEach((it, i) => {
        const read = reads[i];
        if (!read) return;
        termMap.set(it.hashtag, read.term);
        topicMap.set(it.hashtag, read.onTopic);
      });
    } catch (err) {
      console.warn("[signals:tiktok_cc] humanize failed — keeping raw hashtags:", (err as Error).message);
    }
  };
  const termFor = (hashtag: string) => termMap.get(hashtag) ?? hashtag;
  // The model's verdict when it gave one; the conservative lexicon otherwise.
  const onTopicFor = (hashtag: string, term: string, category: string) =>
    topicMap.get(hashtag) ?? isCategoryBearing(term, category);

  // Anonymous access returns the top 3 rows per query and refuses to page
  // (page 2 comes back empty), so the only way to see more of the board is
  // to ask a different question: the 7-day board is what's spiking now, the
  // 30-day board is what has held. Both are worth ranking, and a hashtag on
  // both is a trend rather than a blip.
  const WINDOWS = [7, 30] as const;

  const fetchBoard = async (industryId: string, geo: string, timeRange: number) => {
    const key = `${industryId}:${geo}:${timeRange}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const payload = await doFetchJson<CcPayload>(API_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        timeRange,
        countryCode: geo,
        page: 1,
        limit: 10,
        industryID: industryId,
      }),
      breaker,
    });
    cache.set(key, payload);
    return payload;
  };

  /** Every industry × both windows, tolerating per-board failures. */
  const fetchAllBoards = async (geo: string): Promise<{ payload: CcPayload; category: string; windowDays: number }[]> => {
    const out: { payload: CcPayload; category: string; windowDays: number }[] = [];
    for (const [industryId, category] of Object.entries(INDUSTRY_TO_CATEGORY)) {
      for (const timeRange of WINDOWS) {
        if (breaker.isOpen) return out;
        try {
          out.push({ payload: await fetchBoard(industryId, geo, timeRange), category, windowDays: timeRange });
        } catch (err) {
          console.warn(`[signals:tiktok_cc] industry ${industryId} (${timeRange}d) failed:`, (err as Error).message);
        }
      }
    }
    return out;
  };

  return {
    name: "tiktok_cc",
    async isAvailable() {
      return true; // no key needed
    },
    async fetch(input: AdapterFetchInput): Promise<RawSignal[]> {
      const boards = await fetchAllBoards(input.geo);
      await resolveTerms(boards);
      // A hashtag on both boards would otherwise land twice for the same day
      // and the same term; the spiking read (7d) is the one that ranks, and
      // the 30d board fills in whatever it alone found.
      const bySeen = new Map<string, RawSignal>();
      for (const { payload, category, windowDays } of [...boards].sort((a, b) => a.windowDays - b.windowDays)) {
        for (const sig of ccSignals(payload, category, input.geo, windowDays, termFor, onTopicFor)) {
          const key = `${normalizeTerm(sig.term)}:${sig.category}`;
          if (!bySeen.has(key)) bySeen.set(key, sig);
        }
      }
      // Three spellings of one holiday would otherwise fill three of the
      // ~40 slots a whole night's board reading produces.
      return collapseVariants([...bySeen.values()]);
    },
    async fetchSeries(input: AdapterFetchInput): Promise<RawSeriesPoint[]> {
      const boards = await fetchAllBoards(input.geo);
      await resolveTerms(boards);
      // Longest window first: the 30-day curve carries the 7-day one's days,
      // and a later point for the same (term, day) would only overwrite it
      // with the same value.
      return [...boards]
        .sort((a, b) => b.windowDays - a.windowDays)
        .flatMap(({ payload }) => ccSeries(payload, input.geo, termFor));
    },
  };
}