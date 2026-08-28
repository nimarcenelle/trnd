import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

import { parseGoogleJson } from "./trends-iot";

/**
 * Google Trends RISING related queries — the discovery half of Detect.
 * Interest-over-time (trends-iot) measures the terms we already watch; this
 * adapter asks, per watch term and per metro, "what related searches are
 * breaking out right now?" — surfacing demand phrasings nobody typed into a
 * config. Same unofficial widget surface as trends-iot, same fast-tripping
 * circuit breaker, and it runs only against business-scoped watch terms so
 * one run stays polite.
 */

const EXPLORE_URL = "https://trends.google.com/trends/api/explore";
const RELATED_URL = "https://trends.google.com/trends/api/widgetdata/relatedsearches";

/** "Breakout" means >5000% — cap so one outlier can't own the ranking. */
export const DELTA_CAP = 400;
const MAX_TERMS_PER_RUN = 12;
const MAX_RISING_PER_TERM = 4;

interface ExploreWidget {
  id: string;
  token: string;
  request: unknown;
}

interface RelatedPayload {
  default?: {
    rankedList?: {
      rankedKeyword?: { query?: string; value?: number; formattedValue?: string }[];
    }[];
  };
}

export interface RisingQuery {
  query: string;
  /** Growth percent, capped; "Breakout" arrives as 5000+ from Google. */
  delta: number;
  formatted: string;
}

/** rankedList[1] is "rising" (rankedList[0] is "top"). */
export function extractRisingQueries(payload: RelatedPayload): RisingQuery[] {
  const rising = payload.default?.rankedList?.[1]?.rankedKeyword ?? [];
  return rising
    .filter((k): k is { query: string; value: number; formattedValue?: string } =>
      Boolean(k.query && typeof k.value === "number" && k.value > 0),
    )
    .map((k) => ({
      query: k.query.trim(),
      delta: Math.min(DELTA_CAP, k.value),
      formatted: k.formattedValue ?? `${k.value}%`,
    }))
    .slice(0, MAX_RISING_PER_TERM);
}

export function createTrendsRelatedAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("google_trends_related", 2); // fragile: trip fast

  async function fetchRising(term: string, geo: string): Promise<RisingQuery[]> {
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
    const widget = explore.widgets?.find((w) => w.id === "RELATED_QUERIES");
    if (!widget) throw new Error("no RELATED_QUERIES widget");
    const dataText = await fetchText(
      `${RELATED_URL}?hl=en-US&tz=0&req=${encodeURIComponent(
        JSON.stringify(widget.request),
      )}&token=${encodeURIComponent(widget.token)}`,
      { breaker },
    );
    return extractRisingQueries(parseGoogleJson(dataText));
  }

  return {
    name: "google_trends_related",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      // Business-scoped terms only (they carry a finer geo) — the stock
      // category list already gets IoT coverage.
      const targets = watch.filter((w) => w.geo && w.geo !== "US").slice(0, MAX_TERMS_PER_RUN);
      for (const { term, category, geo } of targets) {
        if (breaker.isOpen) break; // degrade, don't crash
        try {
          for (const rq of await fetchRising(term, geo!)) {
            out.push({
              source: "google_trends",
              term: rq.query,
              category,
              geo: geo!,
              metric_type: "search_interest",
              value: null,
              delta_pct: rq.delta,
              window_days: 30,
              raw: { discovered_from: term, formatted: rq.formatted, rising: true },
            });
          }
        } catch (err) {
          console.warn(`[signals:trends_related] "${term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
