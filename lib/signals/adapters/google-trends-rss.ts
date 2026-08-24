import { XMLParser } from "fast-xml-parser";

import { classifyTerm } from "../category-terms";
import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

const RSS_URL = "https://trends.google.com/trending/rss?geo=";

interface RssItem {
  title?: string;
  "ht:approx_traffic"?: string;
  "ht:news_item"?: unknown;
  pubDate?: string;
}

/** Pure parser — unit-tested against a fixture. */
export function parseTrendsRss(xml: string): { term: string; traffic: number | null; raw: RssItem }[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const items = doc.rss?.channel?.item;
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items];
  return list
    .filter((i) => typeof i.title === "string" && i.title.length > 0)
    .map((i) => {
      const trafficStr = String(i["ht:approx_traffic"] ?? "");
      const numeric = Number(trafficStr.replace(/[^0-9]/g, ""));
      return {
        term: String(i.title),
        traffic: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
        raw: i,
      };
    });
}

/**
 * Google Trends daily trending searches (no key, reliable, real). Generic
 * terms get classified into a category by lexicon; unclassifiable ones are
 * dropped — a trending celebrity name is not small-business signal.
 */
export function createGoogleTrendsRssAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("google_trends_rss");
  return {
    name: "google_trends_rss",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ geo }: AdapterFetchInput): Promise<RawSignal[]> {
      const xml = await fetchText(`${RSS_URL}${encodeURIComponent(geo || "US")}`, { breaker });
      const entries = parseTrendsRss(xml);
      const signals: RawSignal[] = [];
      for (const e of entries) {
        const category = classifyTerm(e.term);
        if (!category) continue;
        signals.push({
          source: "google_trends",
          term: e.term,
          category,
          geo: geo || "US",
          metric_type: "search_interest",
          value: e.traffic,
          // Daily trending list has no baseline; treat presence as a strong
          // rise. Scoring normalizes this alongside real deltas.
          delta_pct: null,
          window_days: 1,
          raw: e.raw,
        });
      }
      return signals;
    },
  };
}
