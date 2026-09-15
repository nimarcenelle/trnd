import { env, isDataForSeoConfigured } from "@/lib/env";
import { recordProviderUsage } from "@/lib/usage/providers";

import { normalizeTerm } from "../normalize";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";
import { type DfsResultRow, historyFrom, mapDfsRow } from "./dataforseo";

/**
 * The category around a brand's own terms: what else its customer searches
 * for, with a year of volume behind each phrase.
 *
 * A DTC brand's category pool used to be its own watch terms, because its
 * category is a free-text identity ("filtered showerhead brand") that no
 * stock board or lexicon files anything under. "Category growth" was the
 * brand's own list averaged, and nothing the brand had not already named
 * could ever reach its ranking. This adapter asks Google Ads for the
 * keywords related to the brand's terms, keeps the ones with real volume
 * the brand is not already watching, and files them under the brand's
 * category: they widen the pool the ranking judges, and their year-on-year
 * moves are what the category's growth is read from. One task per category
 * per run, $0.075.
 */

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live";
/** Seeds per task: the API's own cap. */
export const SEEDS_PER_TASK = 20;
/** Related phrases kept per category per run. */
export const MAX_RELATED = 40;
/** Under this many monthly searches a related phrase is noise, not a category. */
export const MIN_RELATED_VOLUME = 500;
const MAX_TERM_CHARS = 60;

/** Words too common to tie a phrase to a category. */
const STOP = new Set(["the", "and", "for", "with", "how", "what", "best", "near", "me", "you", "your", "top", "new", "vs", "of", "to", "in", "on", "a", "an", "is", "it", "my", "can", "do", "does"]);

/** The words a phrase must share one of to count as the brand's category. */
export function categoryVocabulary(seeds: Iterable<string>, extra: Iterable<string> = []): Set<string> {
  const out = new Set<string>();
  for (const text of [...seeds, ...extra]) {
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

const sharesWord = (keyword: string, vocabulary: Set<string>): boolean =>
  vocabulary.size === 0 || keyword.toLowerCase().split(/[^a-z0-9]+/).some((w) => vocabulary.has(w) || (w.endsWith("s") && vocabulary.has(w.slice(0, -1))) || vocabulary.has(`${w}s`));

/** Pure: the API's rows into the category's related phrases, most searched
 * first, the brand's own terms left out. A phrase that shares no word with
 * the seeds (or the vocabulary given) is not the category: Google Ads'
 * related list handed a haircare brand "weighed down", 1,000 searches a
 * month of nobody talking about hair, and it became a pick. */
export function relatedSignals(
  rows: DfsResultRow[],
  opts: { category: string; geo: string; windowDays: number; exclude: Iterable<string>; vocabulary?: Set<string> },
): { signals: RawSignal[]; series: RawSeriesPoint[] } {
  const exclude = new Set([...opts.exclude].map(normalizeTerm));
  const vocabulary = opts.vocabulary ?? categoryVocabulary(opts.exclude, [opts.category]);
  const seen = new Set<string>();
  const kept = rows
    .filter((r) => typeof r.keyword === "string" && r.keyword.trim().length > 2 && r.keyword.length <= MAX_TERM_CHARS)
    .filter((r) => typeof r.search_volume === "number" && r.search_volume >= MIN_RELATED_VOLUME)
    .filter((r) => sharesWord(r.keyword, vocabulary))
    .filter((r) => {
      const key = normalizeTerm(r.keyword);
      if (exclude.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
    .slice(0, MAX_RELATED);
  const signals: RawSignal[] = [];
  const series: RawSeriesPoint[] = [];
  for (const row of kept) {
    const mapped = mapDfsRow(row, opts.category, opts.geo, opts.windowDays);
    signals.push({ ...mapped.signal, raw: { ...(mapped.signal.raw as object), related: true } });
    series.push(...mapped.series);
  }
  return { signals, series };
}

export function createDataForSeoRelatedAdapter(opts: { fetch?: typeof fetch } = {}): SignalAdapter {
  const seriesCache: RawSeriesPoint[] = [];
  return {
    name: "dataforseo_related",
    async isAvailable() {
      return isDataForSeoConfigured;
    },
    async fetch({ watch, geo, windowDays }: AdapterFetchInput): Promise<RawSignal[]> {
      seriesCache.length = 0;
      // Business-scoped terms only, one task per category: the category is
      // the brand's identity string, so this is one task per brand.
      const byCategory = new Map<string, { terms: string[]; geo: string }>();
      for (const w of watch) {
        if (!w.geo) continue;
        const entry = byCategory.get(w.category) ?? { terms: [], geo: w.geo };
        if (!entry.terms.includes(w.term)) entry.terms.push(w.term);
        byCategory.set(w.category, entry);
      }
      const doFetch = opts.fetch ?? fetch;
      const auth = Buffer.from(`${env.dataForSeoLogin}:${env.dataForSeoPassword}`).toString("base64");
      const out: RawSignal[] = [];
      for (const [category, entry] of byCategory) {
        const seeds = entry.terms.slice(0, SEEDS_PER_TASK);
        try {
          const res = await doFetch(ENDPOINT, {
            method: "POST",
            headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
            body: JSON.stringify([
              { keywords: seeds, location_code: 2840, language_code: "en", sort_by: "search_volume", include_adult_keywords: false, date_from: historyFrom() },
            ]),
            signal: AbortSignal.timeout(40_000),
          });
          recordProviderUsage({ provider: "dataforseo", operation: "keywords_for_keywords", rateKey: "dataforseo:related_task", units: 1, ok: res.ok, note: res.ok ? null : `HTTP ${res.status}` });
          if (!res.ok) throw new Error(`dataforseo related ${res.status}`);
          const data = (await res.json()) as { tasks?: { result?: DfsResultRow[] | null }[] };
          const rows = data.tasks?.[0]?.result ?? [];
          const mapped = relatedSignals(rows, {
            category,
            geo: entry.geo ?? geo ?? "US",
            windowDays,
            exclude: entry.terms,
          });
          out.push(...mapped.signals);
          seriesCache.push(...mapped.series);
        } catch (err) {
          console.warn(`[signals:dataforseo_related] ${category} failed:`, (err as Error).message);
        }
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache.map((p) => ({ ...p, term: normalizeTerm(p.term) }));
    },
  };
}
