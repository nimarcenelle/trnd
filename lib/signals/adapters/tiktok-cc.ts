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

/** Pure mapper — unit-tested against a captured fixture. */
export function ccSignals(
  payload: CcPayload,
  category: string,
  geo: string,
  windowDays: number,
): RawSignal[] {
  if (payload.BaseResp?.StatusCode !== 0) return [];
  return (payload.items ?? [])
    .filter((i) => typeof i.hashtagName === "string" && i.hashtagName.length > 1)
    .map((i) => ({
      source: "tiktok" as const,
      term: String(i.hashtagName),
      category,
      geo,
      metric_type: "conversation",
      value: Number(i.publishCnt) || null,
      delta_pct: curveDelta(i.popularityCurve),
      window_days: windowDays,
      raw: i,
    }));
}

export function ccSeries(payload: CcPayload, geo: string): RawSeriesPoint[] {
  if (payload.BaseResp?.StatusCode !== 0) return [];
  const out: RawSeriesPoint[] = [];
  for (const item of payload.items ?? []) {
    if (!item.hashtagName) continue;
    const term = normalizeTerm(item.hashtagName);
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

export function createTiktokCcAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("tiktok_cc");
  const cache = new Map<string, CcPayload>();

  const fetchIndustry = async (industryId: string, geo: string, windowDays: number) => {
    const key = `${industryId}:${geo}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const payload = await fetchJson<CcPayload>(API_URL, {
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
      const out: RawSignal[] = [];
      for (const [industryId, category] of Object.entries(INDUSTRY_TO_CATEGORY)) {
        if (breaker.isOpen) break;
        try {
          const payload = await fetchIndustry(industryId, input.geo, input.windowDays);
          out.push(...ccSignals(payload, category, input.geo, Math.min(input.windowDays, 7)));
        } catch (err) {
          console.warn(`[signals:tiktok_cc] industry ${industryId} failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(input: AdapterFetchInput): Promise<RawSeriesPoint[]> {
      const out: RawSeriesPoint[] = [];
      for (const industryId of Object.keys(INDUSTRY_TO_CATEGORY)) {
        if (breaker.isOpen) break;
        try {
          const payload = await fetchIndustry(industryId, input.geo, input.windowDays);
          out.push(...ccSeries(payload, input.geo));
        } catch {
          /* logged in fetch() */
        }
      }
      return out;
    },
  };
}