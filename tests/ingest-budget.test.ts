import { describe, expect, it } from "vitest";

import type { Repo } from "../lib/db/repo";
import { runIngest } from "../lib/signals/ingest";
import type { RawSignal, SignalAdapter } from "../lib/signals/types";

const signal: RawSignal = {
  source: "google_trends",
  term: "matcha latte",
  category: "Restaurants & cafés",
  geo: "US",
  metric_type: "interest",
  value: 80,
  delta_pct: 20,
  window_days: 7,
  raw: {},
};

const fakeRepo = {
  listAllBusinesses: async () => [],
  upsertSignals: async (rows: unknown[]) => rows.length,
  upsertSeriesPoints: async (rows: unknown[]) => rows.length,
} as unknown as Repo;

const goodAdapter = (name: string): SignalAdapter => ({
  name,
  isAvailable: async () => true,
  fetch: async () => [signal],
});

// Never settles — the shape of the production hang (an upstream that neither
// responds nor errors).
const hangingAdapter = (name: string): SignalAdapter => ({
  name,
  isAvailable: async () => true,
  fetch: () => new Promise(() => {}),
});

describe("runIngest wall-clock budget", () => {
  it("times out a hanging adapter and still runs the rest", async () => {
    const summary = await runIngest(fakeRepo, {
      adapters: [goodAdapter("first"), hangingAdapter("hangs"), goodAdapter("last")],
      adapterTimeoutMs: 50,
      budgetMs: 10_000,
    });
    expect(summary.reports).toHaveLength(3);
    const [first, hung, last] = summary.reports;
    expect(first).toMatchObject({ adapter: "first", ok: true, signals: 1 });
    expect(hung).toMatchObject({ adapter: "hangs", ok: false, error: "timed out" });
    expect(last).toMatchObject({ adapter: "last", ok: true, signals: 1 });
    expect(summary.totalSignals).toBe(2);
  });

  it("skips remaining adapters once the budget is spent and still returns a summary", async () => {
    // The hang burns the whole 60ms budget (its per-fetch slice is capped by
    // what's left of it, even though adapterTimeoutMs is larger).
    const summary = await runIngest(fakeRepo, {
      adapters: [hangingAdapter("hangs"), goodAdapter("starved"), goodAdapter("starved-too")],
      adapterTimeoutMs: 10_000,
      budgetMs: 60,
    });
    expect(summary.reports).toHaveLength(3);
    const [hung, ...skipped] = summary.reports;
    expect(hung).toMatchObject({ adapter: "hangs", ok: false, error: "timed out" });
    for (const report of skipped) {
      expect(report.skipped).toBe("time budget exhausted");
      expect(report.error).toBeUndefined();
    }
    expect(summary.totalSignals).toBe(0);
    expect(summary.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("times out a hanging fetchSeries without losing the adapter's signals", async () => {
    const adapter: SignalAdapter = {
      ...goodAdapter("series-hangs"),
      fetchSeries: () => new Promise(() => {}),
    };
    const summary = await runIngest(fakeRepo, {
      adapters: [adapter, goodAdapter("after")],
      adapterTimeoutMs: 50,
      budgetMs: 10_000,
    });
    const [hung, after] = summary.reports;
    expect(hung).toMatchObject({ ok: false, error: "timed out", signals: 1 });
    expect(after).toMatchObject({ ok: true, signals: 1 });
  });
});

describe("the anchor must not be starved", () => {
  it("runs search volume before anything that can spend the budget", async () => {
    // DataForSEO anchors the Trends index; without it Trends contributes
    // nothing to the demand score. It sat sixth behind the short-form reads
    // and went 48 hours without writing a row — never failing, just never
    // reached before the 240s budget ran out.
    const { defaultAdapters } = await import("../lib/signals/ingest");
    const order = defaultAdapters().map((a) => a.name);
    expect(order.indexOf("dataforseo")).toBe(0);
    expect(order.indexOf("dataforseo")).toBeLessThan(order.indexOf("youtube"));
  });
});
