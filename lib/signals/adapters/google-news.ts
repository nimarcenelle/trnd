import { XMLParser } from "fast-xml-parser";

import { CATEGORY_CONFIGS } from "../category-terms";
import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

/** Pure parser — unit-tested against a fixture. Returns pubDates of items. */
export function parseNewsRss(xml: string): { title: string; pubDate: string }[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: { title?: string; pubDate?: string }[] | { title?: string; pubDate?: string } } };
  };
  const items = doc.rss?.channel?.item;
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items];
  return list
    .filter((i) => i.title)
    .map((i) => ({ title: String(i.title), pubDate: String(i.pubDate ?? "") }));
}

/**
 * Google News RSS as corroboration: how much recent coverage a watch term is
 * getting. value = article count inside the window.
 */
export function createGoogleNewsAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("news");
  return {
    name: "news",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ geo, windowDays, terms }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      const watch =
        terms.length > 0
          ? terms.map((t) => ({ term: t, category: "" }))
          : CATEGORY_CONFIGS.flatMap((c) =>
              c.watchTerms.slice(0, 3).map((t) => ({ term: t, category: c.category })),
            );
      const cutoff = Date.now() - windowDays * 86400_000;
      for (const { term, category } of watch) {
        if (breaker.isOpen) return out;
        try {
          const xml = await fetchText(
            `https://news.google.com/rss/search?q=${encodeURIComponent(term)}`,
            { breaker },
          );
          const items = parseNewsRss(xml);
          const recent = items.filter((i) => {
            const t = Date.parse(i.pubDate);
            return Number.isFinite(t) && t >= cutoff;
          });
          out.push({
            source: "news",
            term,
            category: category || "General",
            geo: geo || "US",
            metric_type: "news_coverage",
            value: recent.length,
            delta_pct: null,
            window_days: windowDays,
            raw: { total: items.length, recent: recent.length },
          });
        } catch (err) {
          console.warn(`[signals:news] "${term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
