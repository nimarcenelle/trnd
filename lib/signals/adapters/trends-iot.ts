import { normalizeTerm } from "../normalize";
import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";
import { fetchTrendsExplore, isTrendsDfsAvailable } from "./trends-dfs";

/**
 * Google Trends interest-over-time — real search-interest levels and deltas
 * for every watch term, without a paid key. Two paths, tried in order:
 *
 * 1. The unofficial widget API, primed with a real session cookie and paced
 *    like a person (the bare endpoint 429s naked clients immediately).
 * 2. The headless renderer: load the public explore page and capture the
 *    same widget payload off the wire — the pattern that already works for
 *    the Ad Library. Slower, but it reads what any visitor can see.
 *
 * A 90-day window gives daily points: the last value is the current level
 * (0-100), min/max is the range, and last-7-vs-prior-7 is the weekly delta.
 */

const EXPLORE_URL = "https://trends.google.com/trends/api/explore";
const MULTILINE_URL = "https://trends.google.com/trends/api/widgetdata/multiline";
const WINDOW = "today 3-m";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

interface ExploreWidget {
  id: string;
  token: string;
  request: unknown;
}

/** Google prefixes JSON responses with `)]}'` junk; strip and parse. */
export function parseGoogleJson<T>(text: string): T {
  const idx = text.indexOf("{");
  if (idx < 0) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(idx)) as T;
}

export function extractTimelinePoints(
  payload: { default?: { timelineData?: { time: string; value: number[] }[] } },
  term: string,
  geo: string,
): RawSeriesPoint[] {
  const rows = payload.default?.timelineData ?? [];
  return rows.map((r) => ({
    term,
    geo,
    day: new Date(Number(r.time) * 1000).toISOString().slice(0, 10),
    value: r.value?.[0] ?? 0,
  }));
}

export function deltaFromSeries(points: RawSeriesPoint[]): number | null {
  if (points.length < 14) return null;
  const last7 = points.slice(-7).reduce((s, p) => s + p.value, 0) / 7;
  const prev7 = points.slice(-14, -7).reduce((s, p) => s + p.value, 0) / 7;
  if (prev7 <= 0) return null;
  return Math.round(((last7 - prev7) / prev7) * 100);
}

/**
 * The level-and-range read the tracker shows. The literal last point is
 * often a partial day (0 for niche local terms), so the level is the 7-day
 * mean. A series that is mostly zeros isn't "interest 0" — it's a term too
 * small for Google's regional sampling, flagged sparse and said plainly.
 */
export function rangeFromSeries(
  points: RawSeriesPoint[],
): { level: number; min: number; max: number; sparse: boolean } | null {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const last7 = values.slice(-7);
  const level = Math.round(last7.reduce((s, v) => s + v, 0) / last7.length);
  const zeroShare = values.filter((v) => v === 0).length / values.length;
  return {
    level,
    min: Math.min(...values),
    max: Math.max(...values),
    sparse: zeroShare > 0.6,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Widen a too-local term to its core service: strip the locality tokens
 * ("cold plunge nyc" → "cold plunge", "banya near me" → "banya"); when the
 * qualifier isn't a known token ("sports massage flatiron"), drop the
 * trailing word — locality qualifiers trail in search phrasing.
 */
export function coreTerm(term: string, locality: string[] = [], opts: { strict?: boolean } = {}): string {
  const strip = new Set(["near", "me", "local", "nyc", ...locality.map((l) => l.toLowerCase())]);
  const parts = term.toLowerCase().trim().split(/\s+/);
  const kept = parts.filter((p) => !strip.has(p));
  if (kept.length > 0 && kept.length < parts.length) return kept.join(" ");
  // Dropping the trailing word assumes the qualifier trails — true for
  // "sports massage flatiron", false for "post game drinks", where the last
  // word is the head noun and losing it changes the subject entirely. On a
  // search index a bad widen measures a broader term; on a live feed it
  // measures a different topic ("post game" returned sports chatter and an
  // NSFW top post for a café). `strict` callers take no read over a wrong one.
  if (parts.length >= 3 && !opts.strict) return parts.slice(0, -1).join(" ");
  return term.toLowerCase().trim();
}

/** A real session cookie — the difference between a 429 and a 200. */
async function primeTrendsCookie(): Promise<string> {
  try {
    const res = await fetch("https://trends.google.com/trends/explore?hl=en-US", {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const setCookies: string[] =
      (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  } catch {
    return "";
  }
}

export function exploreePageUrl(term: string, geo: string): string {
  const params = new URLSearchParams({ date: WINDOW, q: term, hl: "en-US" });
  if (geo && geo !== "US") params.set("geo", geo);
  else params.set("geo", "US");
  return `https://trends.google.com/trends/explore?${params}`;
}

export function createTrendsIotAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("google_trends_iot", 3);
  const seriesCache: RawSeriesPoint[] = [];

  async function fetchSeriesDirect(term: string, geo: string, cookie: string): Promise<RawSeriesPoint[]> {
    const req = {
      comparisonItem: [{ keyword: term, geo: geo === "US" ? "US" : geo, time: WINDOW }],
      category: 0,
      property: "",
    };
    const headers = {
      "user-agent": UA,
      accept: "application/json, text/plain, */*",
      referer: "https://trends.google.com/trends/explore",
      ...(cookie ? { cookie } : {}),
    };
    const exploreText = await fetchText(
      `${EXPLORE_URL}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`,
      { breaker, headers },
    );
    const explore = parseGoogleJson<{ widgets?: ExploreWidget[] }>(exploreText);
    const widget = explore.widgets?.find((w) => w.id === "TIMESERIES");
    if (!widget) throw new Error("no TIMESERIES widget");
    const dataText = await fetchText(
      `${MULTILINE_URL}?hl=en-US&tz=0&req=${encodeURIComponent(
        JSON.stringify(widget.request),
      )}&token=${encodeURIComponent(widget.token)}`,
      { breaker, headers },
    );
    return extractTimelinePoints(parseGoogleJson(dataText), term, geo);
  }

  return {
    name: "google_trends_iot",
    async isAvailable() {
      return true; // renderer fallback means the API breaker alone can't kill it
    },
    async fetch({ terms, watch, geo }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      const targets: { term: string; category: string; geo?: string; locality?: string[] }[] =
        watch.length > 0 ? watch : terms.map((t) => ({ term: t, category: "" }));
      if (targets.length === 0) return out;

      // The paid API first, for every national term: it answers every time,
      // and the widget below is only asked for what it did not cover (and
      // for the metro-scoped terms the API is not asked for).
      const answered = new Set<string>();
      if (isTrendsDfsAvailable()) {
        const national = targets.filter((t) => !t.geo || t.geo === "US");
        const read = await fetchTrendsExplore(
          national.map((t) => t.term),
          "US",
        );
        for (const t of national) {
          const points = read.series.get(t.term) ?? read.series.get(t.term.toLowerCase()) ?? [];
          const range = rangeFromSeries(points);
          if (points.length === 0 || !range) continue;
          answered.add(t.term);
          seriesCache.push(...points.map((p) => ({ ...p, term: t.term, geo: "US" })));
          out.push({
            source: "google_trends",
            term: t.term,
            category: t.category,
            geo: "US",
            metric_type: "search_interest",
            value: range.level,
            delta_pct: range.sparse ? null : deltaFromSeries(points),
            window_days: 7,
            raw: {
              points: points.length,
              min: range.min,
              max: range.max,
              sparse: range.sparse,
              adjusted: false,
              measuredTerm: t.term,
              measuredGeo: "US",
              window: WINDOW,
              via: "dataforseo",
            },
          });
          for (const rq of read.rising.get(t.term) ?? []) {
            out.push({
              source: "google_trends",
              term: rq.query,
              category: t.category,
              geo: "US",
              metric_type: "search_interest",
              value: null,
              delta_pct: rq.delta,
              window_days: 30,
              raw: { discovered_from: t.term, formatted: rq.formatted, rising: true, via: "dataforseo" },
            });
          }
        }
      }
      const remaining = targets.filter((t) => !answered.has(t.term));
      if (remaining.length === 0) return out;

      const cookie = await primeTrendsCookie();
      // Boxed so the closure assignment survives TS control-flow narrowing.
      const rctx: { r: import("@/lib/import/render").Renderer | null; tried: boolean } = { r: null, tried: false };

      // One read attempt: primed widget API first, renderer capture second.
      const readOnce = async (t: string, g: string): Promise<RawSeriesPoint[]> => {
        if (!breaker.isOpen) {
          try {
            const points = await fetchSeriesDirect(t, g, cookie);
            await sleep(800 + Math.random() * 1200);
            return points;
          } catch (err) {
            console.warn(`[signals:trends_iot] direct "${t}"@${g} failed:`, (err as Error).message);
          }
        }
        if (!rctx.tried) {
          rctx.tried = true;
          const { getRenderer } = await import("@/lib/import/render");
          rctx.r = await getRenderer();
        }
        if (rctx.r) {
          try {
            const body = await rctx.r.capture(exploreePageUrl(t, g), /widgetdata\/multiline/);
            if (body) return extractTimelinePoints(parseGoogleJson(body), t, g);
          } catch (err) {
            console.warn(`[signals:trends_iot] render "${t}"@${g} failed:`, (err as Error).message);
          }
        }
        return [];
      };

      try {
        for (const { term, category, geo: termGeo, locality } of remaining) {
          const g = termGeo ?? geo ?? "US";

          // No-fail ladder: the exact local read is best, but a hyper-local
          // term is often below Google's regional meter — widen to the core
          // service nationally rather than report nothing. What was actually
          // measured always travels with the number.
          let points = await readOnce(term, g);
          let range = rangeFromSeries(points);
          let measuredTerm = term;
          let measuredGeo = g;
          if (!range || range.sparse) {
            const widened = coreTerm(term, locality);
            const nextTerm = widened !== term.toLowerCase() ? widened : term;
            const p2 = await readOnce(nextTerm, "US");
            const r2 = rangeFromSeries(p2);
            if (r2 && (!r2.sparse || !range)) {
              points = p2;
              range = r2;
              measuredTerm = nextTerm;
              measuredGeo = "US";
            }
          }

          if (points.length === 0 || !range) continue;
          const adjusted = measuredTerm !== term || measuredGeo !== g;
          // Series stays keyed to the watch term/geo so charts read continuously.
          seriesCache.push(...points.map((p) => ({ ...p, term, geo: g })));
          out.push({
            source: "google_trends",
            term,
            category,
            geo: g,
            metric_type: "search_interest",
            value: range.level,
            // A delta computed over a mostly-zero series is spike noise.
            delta_pct: range.sparse ? null : deltaFromSeries(points),
            window_days: 7,
            raw: {
              points: points.length,
              min: range.min,
              max: range.max,
              sparse: range.sparse,
              adjusted,
              measuredTerm,
              measuredGeo,
              window: WINDOW,
            },
          });
        }
      } finally {
        await rctx.r?.close().catch(() => {});
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache.map((p) => ({ ...p, term: normalizeTerm(p.term) }));
    },
  };
}
