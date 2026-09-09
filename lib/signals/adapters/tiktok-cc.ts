import { isGeminiConfigured } from "@/lib/env";

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

/** The curve is normalized 0–100 across the window; the trailing point is
 * usually 0 (today, partial). Drop trailing zeros, then read first → last. */
export function curveDelta(curve: CcCurvePoint[] | undefined): number | null {
  const points = [...(curve ?? [])];
  while (points.length > 0 && points[points.length - 1].value === 0) points.pop();
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const pct = ((last - first) / Math.max(first, 1)) * 100;
  return Math.max(-100, Math.min(100, Math.round(pct)));
}

/** Pure mapper — unit-tested against a captured fixture. `termFor` swaps the
 * raw hashtag slug for a readable trend phrase; the slug stays in `raw`. */
export function ccSignals(
  payload: CcPayload,
  category: string,
  geo: string,
  windowDays: number,
  termFor: (hashtag: string) => string = (h) => h,
): RawSignal[] {
  if (payload.BaseResp?.StatusCode !== 0) return [];
  return (payload.items ?? [])
    .filter((i) => typeof i.hashtagName === "string" && i.hashtagName.length > 1)
    .map((i) => ({
      source: "tiktok" as const,
      term: termFor(String(i.hashtagName)),
      category,
      geo,
      metric_type: "conversation",
      value: Number(i.publishCnt) || null,
      delta_pct: curveDelta(i.popularityCurve),
      window_days: windowDays,
      raw: i,
    }));
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
  /** Injectable for tests; defaults to the Gemini pass when configured. */
  humanize?: (hashtags: string[]) => Promise<string[]>;
  /** Injectable for tests; defaults to the hardened fetchJson. */
  fetchJson?: typeof fetchJson;
} = {}): SignalAdapter {
  const doFetchJson = opts.fetchJson ?? fetchJson;
  const breaker = new CircuitBreaker("tiktok_cc");
  const cache = new Map<string, CcPayload>();
  // hashtag slug → readable trend phrase, built once per run over every
  // industry's items so signals and series always share the same term.
  const termMap = new Map<string, string>();
  let termsResolved = false;

  const resolveTerms = async (payloads: CcPayload[]) => {
    if (termsResolved) return;
    termsResolved = true;
    const names = [
      ...new Set(
        payloads
          .flatMap((p) => p.items ?? [])
          .map((i) => i.hashtagName)
          .filter((n): n is string => typeof n === "string" && n.length > 1),
      ),
    ];
    if (names.length === 0) return;
    try {
      const humanize =
        opts.humanize ??
        (isGeminiConfigured
          ? (await import("@/lib/ai/gemini")).humanizeTrendTerms
          : null);
      if (!humanize) return;
      const phrases = await humanize(names);
      names.forEach((n, i) => termMap.set(n, phrases[i] ?? n));
    } catch (err) {
      console.warn("[signals:tiktok_cc] humanize failed — keeping raw hashtags:", (err as Error).message);
    }
  };
  const termFor = (hashtag: string) => termMap.get(hashtag) ?? hashtag;

  const fetchIndustry = async (industryId: string, geo: string, windowDays: number) => {
    const key = `${industryId}:${geo}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const payload = await doFetchJson<CcPayload>(API_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        timeRange: windowDays <= 7 ? 7 : 30,
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

  return {
    name: "tiktok_cc",
    async isAvailable() {
      return true; // no key needed
    },
    async fetch(input: AdapterFetchInput): Promise<RawSignal[]> {
      const collected: { payload: CcPayload; category: string }[] = [];
      for (const [industryId, category] of Object.entries(INDUSTRY_TO_CATEGORY)) {
        if (breaker.isOpen) break;
        try {
          collected.push({ payload: await fetchIndustry(industryId, input.geo, input.windowDays), category });
        } catch (err) {
          console.warn(`[signals:tiktok_cc] industry ${industryId} failed:`, (err as Error).message);
        }
      }
      await resolveTerms(collected.map((c) => c.payload));
      return collected.flatMap(({ payload, category }) =>
        ccSignals(payload, category, input.geo, Math.min(input.windowDays, 7), termFor),
      );
    },
    async fetchSeries(input: AdapterFetchInput): Promise<RawSeriesPoint[]> {
      const payloads: CcPayload[] = [];
      for (const industryId of Object.keys(INDUSTRY_TO_CATEGORY)) {
        if (breaker.isOpen) break;
        try {
          payloads.push(await fetchIndustry(industryId, input.geo, input.windowDays));
        } catch {
          /* logged in fetch() */
        }
      }
      await resolveTerms(payloads);
      return payloads.flatMap((p) => ccSeries(p, input.geo, termFor));
    },
  };
}