import { env, isDataForSeoConfigured } from "@/lib/env";
import { normalizeTerm } from "../normalize";
import type { AdapterFetchInput, RawSeriesPoint, RawSignal, SignalAdapter } from "../types";

/**
 * DataForSEO Google Ads search volume — the sturdy, paid backbone for watch
 * terms, replacing dependence on Google's fragile unofficial trends
 * endpoints. Real monthly volumes with 12 months of history per term;
 * month-over-month delta feeds the momentum component. Gated on
 * DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.
 */

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

export interface DfsResultRow {
  keyword: string;
  search_volume: number | null;
  monthly_searches?: { year: number; month: number; search_volume: number }[] | null;
}

/** Month-over-month delta from the two most recent months with data. */
export function deltaFromMonthly(rows: DfsResultRow["monthly_searches"]): number | null {
  const months = [...(rows ?? [])].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
  if (months.length < 2) return null;
  const prev = months[months.length - 2].search_volume;
  const last = months[months.length - 1].search_volume;
  if (prev <= 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

/** Pure mapper: one API result row → signal + series points. Unit-tested. */
export function mapDfsRow(
  row: DfsResultRow,
  category: string,
  geo: string,
  windowDays: number,
): { signal: RawSignal; series: RawSeriesPoint[] } {
  const series = [...(row.monthly_searches ?? [])]
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .map((m) => ({
      term: row.keyword,
      geo,
      day: `${m.year}-${String(m.month).padStart(2, "0")}-01`,
      value: m.search_volume,
    }));
  return {
    signal: {
      source: "dataforseo",
      term: row.keyword,
      category,
      geo,
      metric_type: "search_volume",
      value: row.search_volume,
      delta_pct: deltaFromMonthly(row.monthly_searches),
      window_days: windowDays,
      raw: { months: series.length },
    },
    series,
  };
}

export function createDataForSeoAdapter(): SignalAdapter {
  const seriesCache: RawSeriesPoint[] = [];
  return {
    name: "dataforseo",
    async isAvailable() {
      return isDataForSeoConfigured;
    },
    async fetch({ watch, geo, windowDays }: AdapterFetchInput): Promise<RawSignal[]> {
      // Business-scoped terms only — this is the per-business demand read.
      const targets = watch.filter((w) => w.geo).slice(0, 100);
      if (targets.length === 0) return [];
      const auth = Buffer.from(`${env.dataForSeoLogin}:${env.dataForSeoPassword}`).toString("base64");
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
        body: JSON.stringify([
          { keywords: targets.map((t) => t.term), location_code: 2840 /* United States */, language_code: "en" },
        ]),
      });
      if (!res.ok) throw new Error(`dataforseo ${res.status}`);
      const data = (await res.json()) as {
        tasks?: { result?: DfsResultRow[] | null; status_message?: string }[];
      };
      const rows = data.tasks?.[0]?.result ?? [];
      const byTerm = new Map(targets.map((t) => [normalizeTerm(t.term), t]));
      const out: RawSignal[] = [];
      for (const row of rows) {
        if (row.search_volume === null) continue;
        const target = byTerm.get(normalizeTerm(row.keyword));
        if (!target) continue;
        const mapped = mapDfsRow(row, target.category, target.geo ?? geo ?? "US", windowDays);
        out.push(mapped.signal);
        seriesCache.push(...mapped.series);
      }
      return out;
    },
    async fetchSeries(): Promise<RawSeriesPoint[]> {
      return seriesCache.map((p) => ({ ...p, term: normalizeTerm(p.term) }));
    },
  };
}
