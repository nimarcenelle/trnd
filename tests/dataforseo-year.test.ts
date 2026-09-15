import { describe, expect, it } from "vitest";

import { mapDfsRow, yoyFromMonthly, type DfsResultRow } from "../lib/signals/adapters/dataforseo";
import { MAX_RELATED, MIN_RELATED_VOLUME, relatedSignals } from "../lib/signals/adapters/dataforseo-related";
import { mapTrendsExplore } from "../lib/signals/adapters/trends-dfs";
import { categoryGrowth, monthlyVolumes, seasonalFromMonthly, yearOverYearFromMonthly } from "../lib/scoring/gather";
import type { Signal } from "../lib/db/types";

/** Fifteen months ending August 2026, oldest first, at the volumes given. */
function months(values: number[], endYear = 2026, endMonth = 8): NonNullable<DfsResultRow["monthly_searches"]> {
  const out: { year: number; month: number; search_volume: number }[] = [];
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const idx = endYear * 12 + (endMonth - 1) - (values.length - 1 - i);
    out.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1, search_volume: values[i] });
  }
  return out.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
}

const now = new Date("2026-09-14T12:00:00Z");

describe("year on year from a row's monthly searches", () => {
  it("compares the latest three months with the same three a year earlier", () => {
    // Jun-Aug 2025 = 1000 each; Jun-Aug 2026 = 1220 each: up 22%.
    const values = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1220, 1220, 1220];
    expect(yoyFromMonthly(months(values))).toBe(22);
  });

  it("needs both windows in full", () => {
    expect(yoyFromMonthly(months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
    expect(yoyFromMonthly(null)).toBeNull();
  });

  it("rides on the mapped row", () => {
    const row: DfsResultRow = { keyword: "filtered showerhead", search_volume: 8100, monthly_searches: months(Array(15).fill(500)) };
    expect((mapDfsRow(row, "c", "US", 7).signal.raw as { yoyPct: number }).yoyPct).toBe(0);
  });
});

describe("the category's related phrases", () => {
  const rows: DfsResultRow[] = [
    { keyword: "hard water filter", search_volume: 8100, monthly_searches: months(Array(15).fill(8000)) },
    { keyword: "shower head filter", search_volume: 12100, monthly_searches: months(Array(15).fill(12000)) },
    { keyword: "chlorine shower filter", search_volume: 720, monthly_searches: null },
    { keyword: "tiny phrase", search_volume: 40, monthly_searches: null },
    { keyword: "Hard Water Filter", search_volume: 8100, monthly_searches: null },
    { keyword: "no volume", search_volume: null, monthly_searches: null },
  ];

  it("keeps real volume the brand is not already watching, most searched first, once each", () => {
    const { signals, series } = relatedSignals(rows, { category: "shower filter brand", geo: "US", windowDays: 7, exclude: ["hard water filter"] });
    expect(signals.map((s) => s.term)).toEqual(["shower head filter", "chlorine shower filter"]);
    expect(signals[0].source).toBe("dataforseo");
    expect(signals[0].metric_type).toBe("search_volume");
    expect((signals[0].raw as { related: boolean }).related).toBe(true);
    expect(series.length).toBe(15);
    expect(MIN_RELATED_VOLUME).toBeGreaterThan(40);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ keyword: `phrase ${i}`, search_volume: 1000 + i, monthly_searches: null }));
    expect(relatedSignals(many, { category: "c", geo: "US", windowDays: 7, exclude: [] }).signals).toHaveLength(MAX_RELATED);
  });
});

describe("Google Trends through DataForSEO", () => {
  const result = [
    {
      items: [
        {
          type: "google_trends_graph",
          keywords: ["hard water", "skin barrier"],
          data: [
            { date_from: "2026-06-15", date_to: "2026-06-15", timestamp: 1781481600, values: [40, 10] },
            { date_from: "2026-06-16", date_to: "2026-06-16", timestamp: 1781568000, values: [42, null] },
          ],
        },
        { type: "google_trends_queries_list", keywords: ["hard water"], data: { top: [{ query: "hard water stains", value: 100 }], rising: [{ query: "hard water hair", value: 5000 }, { query: "hard water filter", value: 250 }] } },
      ],
    },
  ];

  it("maps each keyword's line and its rising queries", () => {
    const read = mapTrendsExplore(result, "US");
    expect(read.series.get("hard water")).toEqual([
      { term: "hard water", geo: "US", day: "2026-06-15", value: 40 },
      { term: "hard water", geo: "US", day: "2026-06-16", value: 42 },
    ]);
    expect(read.series.get("skin barrier")).toHaveLength(1);
    expect(read.rising.get("hard water")?.map((q) => [q.query, q.delta])).toEqual([
      ["hard water hair", 400],
      ["hard water filter", 250],
    ]);
  });

  it("reads nothing from a shape it does not know", () => {
    expect(mapTrendsExplore({ nope: true }, "US").series.size).toBe(0);
    expect(mapTrendsExplore(null, "US").rising.size).toBe(0);
  });
});

describe("a year of monthly volume", () => {
  const monthly = (values: number[]) => months(values).map((m) => ({ day: `${m.year}-${String(m.month).padStart(2, "0")}-01`, value: m.search_volume }));

  it("keeps complete months only, and never a daily index or view point", () => {
    const points = [
      ...monthly([1000, 1100, 1200]),
      { day: "2026-09-01", value: 5000 }, // the current month: partial
      { day: "2026-08-01", value: 40 }, // a Trends index that landed on the first
      { day: "2026-08-14", value: 9000 }, // a daily view total
    ];
    expect(monthlyVolumes(points, now)).toEqual([
      { month: "2026-06", value: 1000 },
      { month: "2026-07", value: 1100 },
      { month: "2026-08", value: 1200 },
    ]);
  });

  it("reads the season from this month and next a year ago against the yearly norm", () => {
    // Fifteen months ending Aug 2026; Sep and Oct 2025 (indices 3 and 4) ran double.
    const values = [1000, 1000, 1000, 2000, 2000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
    const read = seasonalFromMonthly(monthly(values), now);
    expect(read?.inWindow).toBe(true);
    expect(read?.fit).toBe(95);
    expect(read?.label).toBe("Last September ran 100% above the term's yearly norm");
    const flat = seasonalFromMonthly(monthly(Array(15).fill(1000)), now);
    expect(flat?.inWindow).toBe(false);
    expect(flat?.label).toBe("Last September ran about at the term's yearly norm");
  });

  it("needs eight months over most of a year", () => {
    expect(seasonalFromMonthly(monthly([1, 2, 3, 4, 5].map((v) => v * 1000)), now)).toBeNull();
  });

  it("reads the term's own year on year from the stored months", () => {
    const values = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1220, 1220, 1220];
    expect(yearOverYearFromMonthly(monthly(values), now)).toBe(22);
    expect(yearOverYearFromMonthly(monthly(values.slice(3)), now)).toBeNull();
  });
});

describe("category growth", () => {
  const row = (over: Partial<Signal>): Signal =>
    ({
      id: "s",
      source: "dataforseo",
      term: "t",
      normalized_term: "t",
      category: "c",
      geo: "US",
      metric_type: "search_volume",
      value: 1000,
      delta_pct: 5,
      window_days: 7,
      raw: {},
      captured_at: now.toISOString(),
      ...over,
    }) as Signal;

  it("weights each term's year by its volume when three terms carry one", () => {
    const reads = [
      row({ value: 1000, raw: { yoyPct: 10 } }),
      row({ value: 3000, raw: { yoyPct: 30 } }),
      row({ value: 1000, raw: { yoyPct: -10 } }),
      row({ source: "youtube", metric_type: "shortform_views", delta_pct: 90 }),
    ];
    // (10 x 1000 + 30 x 3000 - 10 x 1000) / 5000
    expect(categoryGrowth(reads, now)).toEqual({ pct: 18, basis: "year" });
  });

  it("falls back to this week's median move", () => {
    const reads = [
      row({ source: "youtube", metric_type: "shortform_views", delta_pct: 30 }),
      row({ source: "google_trends", metric_type: "search_interest", delta_pct: 10 }),
      row({ source: "tiktok", metric_type: "conversation", delta_pct: 20 }),
      row({ raw: { yoyPct: 50 } }),
    ];
    expect(categoryGrowth(reads, now)).toEqual({ pct: 20, basis: "week" });
  });
});

describe("a related phrase must be about the category", () => {
  it("drops a phrase that shares no word with the brand's terms", () => {
    const rows: DfsResultRow[] = [
      { keyword: "air drying cream", search_volume: 2000, monthly_searches: null },
      { keyword: "weighed down", search_volume: 1000, monthly_searches: null },
      { keyword: "hair creams", search_volume: 900, monthly_searches: null },
    ];
    const { signals } = relatedSignals(rows, { category: "clean haircare and styling brand", geo: "US", windowDays: 7, exclude: ["air dry cream", "frizz halo"] });
    expect(signals.map((s) => s.term)).toEqual(["air drying cream", "hair creams"]);
  });
});
