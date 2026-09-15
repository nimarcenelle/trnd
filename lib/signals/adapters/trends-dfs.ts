import { env, isDataForSeoConfigured } from "@/lib/env";

import type { RawSeriesPoint } from "../types";
import { DELTA_CAP, type RisingQuery } from "./trends-related";

/**
 * Google Trends through DataForSEO: the same 90-day interest line and the
 * same rising related queries the unofficial widget gives, from a paid API
 * that answers every time.
 *
 * The widget path (trends-iot.ts, trends-related.ts) primes a cookie and
 * hopes; it answered 429 from a laptop during the audit that named it the
 * most fragile source in the stack, and the renderer that backs it up does
 * not exist on Vercel. A term's whole Culture read (lifecycle, velocity,
 * the demand chart) hangs off this line, so it goes through the API first
 * and the widget only fills what the API did not answer. Five terms per
 * task at $0.009 a task: a brand's twenty terms are four cents a day.
 */

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live";
export const TERMS_PER_TASK = 5;
const TIME_RANGE = "past_90_days";
const MAX_RISING_PER_TERM = 4;

export interface TrendsExploreRead {
  /** Daily points per term, keyed by the term as it was asked. */
  series: Map<string, RawSeriesPoint[]>;
  /** Rising related queries per term. */
  rising: Map<string, RisingQuery[]>;
}

interface GraphItem {
  type?: string;
  keywords?: unknown;
  data?: { date_from?: unknown; date_to?: unknown; timestamp?: unknown; values?: unknown }[] | null;
}
interface QueriesItem {
  type?: string;
  keywords?: unknown;
  data?: { top?: unknown; rising?: unknown } | null;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function dayFrom(point: { date_to?: unknown; date_from?: unknown; timestamp?: unknown }): string | null {
  for (const v of [point.date_to, point.date_from]) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  if (typeof point.timestamp === "number" && Number.isFinite(point.timestamp)) {
    return new Date(point.timestamp * 1000).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Pure mapper over one task's result. Values in a graph point line up with
 * the item's keywords, so a five-term task is one item with five-wide rows.
 * Every field is optional: a renamed key is a missing read, never a throw.
 */
export function mapTrendsExplore(result: unknown, geo: string): TrendsExploreRead {
  const read: TrendsExploreRead = { series: new Map(), rising: new Map() };
  const results = Array.isArray(result) ? result : [];
  for (const r of results) {
    const items = (r as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const item = raw as GraphItem & QueriesItem;
      const keywords = strList(item.keywords);
      if (item.type === "google_trends_graph" && Array.isArray(item.data)) {
        for (const point of item.data) {
          const day = dayFrom(point);
          const values = Array.isArray(point.values) ? point.values : [];
          if (!day) continue;
          keywords.forEach((term, i) => {
            const v = values[i];
            if (typeof v !== "number" || !Number.isFinite(v)) return;
            const list = read.series.get(term) ?? [];
            list.push({ term, geo, day, value: v });
            read.series.set(term, list);
          });
        }
      } else if (item.type === "google_trends_queries_list" && item.data && typeof item.data === "object") {
        const term = keywords[0];
        if (!term) continue;
        const rising = Array.isArray(item.data.rising) ? item.data.rising : [];
        const out: RisingQuery[] = [];
        for (const q of rising) {
          const row = q as { query?: unknown; value?: unknown };
          const query = typeof row.query === "string" ? row.query.trim() : "";
          const value = typeof row.value === "number" ? row.value : typeof row.value === "string" ? Number(row.value.replace(/[^0-9]/g, "")) : NaN;
          if (!query || !Number.isFinite(value) || value <= 0) continue;
          out.push({ query, delta: Math.min(DELTA_CAP, value), formatted: `${value}%` });
          if (out.length >= MAX_RISING_PER_TERM) break;
        }
        read.rising.set(term, out);
      }
    }
  }
  for (const [term, points] of read.series) {
    read.series.set(
      term,
      [...points].sort((a, b) => a.day.localeCompare(b.day)),
    );
  }
  return read;
}

export function isTrendsDfsAvailable(): boolean {
  return isDataForSeoConfigured;
}

/** One task per five terms; a task that fails loses its five terms to the
 * widget ladder, never the run. */
export async function fetchTrendsExplore(
  terms: string[],
  geo = "US",
  opts: { fetch?: typeof fetch } = {},
): Promise<TrendsExploreRead> {
  const read: TrendsExploreRead = { series: new Map(), rising: new Map() };
  if (!isDataForSeoConfigured || terms.length === 0) return read;
  const doFetch = opts.fetch ?? fetch;
  const auth = Buffer.from(`${env.dataForSeoLogin}:${env.dataForSeoPassword}`).toString("base64");
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += TERMS_PER_TASK) batches.push(unique.slice(i, i + TERMS_PER_TASK));
  // Every task at once. Each is a live Google Trends read on DataForSEO's
  // side (six to twenty seconds); five of them in a row outlived a signup's
  // scan budget and the whole adapter was cut off with nothing written.
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
          body: JSON.stringify([
            {
              keywords: batch,
              location_code: 2840,
              language_code: "en",
              time_range: TIME_RANGE,
              item_types: ["google_trends_graph", "google_trends_queries_list"],
            },
          ]),
          signal: AbortSignal.timeout(40_000),
        });
        if (!res.ok) throw new Error(`dataforseo trends ${res.status}`);
        const data = (await res.json()) as { tasks?: { result?: unknown; status_code?: number; status_message?: string }[] };
        const task = data.tasks?.[0];
        // A task-level refusal arrives inside a 200: say what it said.
        if (task && task.status_code !== undefined && task.status_code !== 20000) {
          throw new Error(`task ${task.status_code}: ${task.status_message ?? "unknown"}`);
        }
        return mapTrendsExplore(task?.result, geo);
      } catch (err) {
        console.warn(`[signals:trends_dfs] ${batch.join(", ")} failed:`, (err as Error).message);
        return null;
      }
    }),
  );
  for (const mapped of results) {
    if (!mapped) continue;
    for (const [k, v] of mapped.series) read.series.set(k, v);
    for (const [k, v] of mapped.rising) read.rising.set(k, v);
  }
  return read;
}
