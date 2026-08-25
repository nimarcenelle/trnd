import { normalizeTerm } from "../normalize";
import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";

/**
 * Google Trends interest-over-time via the unofficial widget endpoints (the
 * same surface the `google-trends-api` package wraps — implemented directly
 * to avoid an unmaintained dependency; see DECISIONS.md). Real numbers, but
 * rate-limits hard and breaks often, so everything is wrapped in the shared
 * retry + circuit breaker and the adapter degrades instead of crashing the
 * job.
 */

const EXPLORE_URL = "https://trends.google.com/trends/api/explore";
const MULTILINE_URL = "https://trends.google.com/trends/api/widgetdata/multiline";

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

export function createTrendsIotAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("google_trends_iot", 2); // fragile: trip fast
  const seriesCache: RawSeriesPoint[] = [];

  async function fetchSeriesForTerm(term: string, geo: string): Promise<RawSeriesPoint[]> {
    const req = {
      comparisonItem: [{ keyword: term, geo: geo === "US" ? "US" : geo, time: "today 1-m" }],
      category: 0,
      property: "",
    };
    const exploreText = await fetchText(
      `${EXPLORE_URL}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`,
      { breaker },
    );
    const explore = parseGoogleJson<{ widgets?: ExploreWidget[] }>(exploreText);
    const widget = explore.widgets?.find((w) => w.id === "TIMESERIES");
    if (!widget) throw new Error("no TIMESERIES widget");
    const dataText = await fetchText(
      `${MULTILINE_URL}?hl=en-US&tz=0&req=${encodeURIComponent(
        JSON.stringify(widget.request),
      )}&token=${encodeURIComponent(widget.token)}`,
      { breaker },
    );
    return extractTimelinePoints(parseGoogleJson(dataText), term, geo);
  }

  return {
    name: "google_trends_iot",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ terms, watch, geo }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      const targets: { term: string; category: string; geo?: string }[] =
        watch.length > 0 ? watch : terms.map((t) => ({ term: t, category: "" }));
      for (const { term, category, geo: termGeo } of targets) {
        if (breaker.isOpen) break; // degrade, don't crash
        const g = termGeo ?? geo ?? "US";
        try {
          const points = await fetchSeriesForTerm(term, g);
          seriesCache.push(...points);
          const last = points.at(-1);
          out.push({
            source: "google_trends",
            term,
            category,
            geo: g,
            metric_type: "search_interest",
            value: last?.value ?? null,
            delta_pct: deltaFromSeries(points),
            window_days: 7,
            raw: { points: points.length },
          });
        } catch (err) {
          console.warn(`[signals:trends_iot] "${term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache.map((p) => ({ ...p, term: normalizeTerm(p.term) }));
    },
  };
}
