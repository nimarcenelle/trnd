import { describe, expect, it } from "vitest";

import type { Signal } from "../lib/db/types";
import { actionPctFor, levelKindOf, seasonalFromSeries } from "../lib/scoring/gather";

const DAY = 86400_000;
const now = new Date("2026-09-12T12:00:00Z");
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** A daily series back from `now`, valued by a function of days ago. */
const daily = (days: number, value: (ago: number) => number) =>
  Array.from({ length: days }, (_, i) => {
    const ago = days - 1 - i;
    return { day: dayOf(new Date(now.getTime() - ago * DAY)), value: value(ago) };
  });

const signal = (over: Partial<Signal>): Signal =>
  ({
    id: "s",
    source: "tiktok",
    term: "hard water",
    normalized_term: "hard_water",
    category: "c",
    geo: "US",
    metric_type: "shortform_views",
    value: 500,
    delta_pct: null,
    window_days: 7,
    raw: null,
    captured_at: now.toISOString(),
    ...over,
  }) as Signal;

describe("seasonalFromSeries", () => {
  it("needs a year of readable history", () => {
    expect(seasonalFromSeries(daily(200, () => 50), now)).toBeNull();
    expect(seasonalFromSeries(daily(400, () => 50).filter((_, i) => i % 20 === 0), now)).toBeNull();
  });

  it("reads this window last year against that year's monthly norm", () => {
    // Flat at 40 all year, except the five weeks around a year ago ran at 60.
    const inSeason = daily(400, (ago) => (ago >= 344 && ago <= 386 ? 60 : 40));
    const read = seasonalFromSeries(inSeason, now);
    expect(read?.inWindow).toBe(true);
    expect(read?.fit).toBeGreaterThan(80);
    expect(read?.label).toContain("above the term's yearly norm");

    const offSeason = daily(400, (ago) => (ago >= 344 && ago <= 386 ? 20 : 40));
    const off = seasonalFromSeries(offSeason, now);
    expect(off?.inWindow).toBe(false);
    expect(off?.fit).toBeLessThan(20);
    expect(off?.label).toContain("below the term's yearly norm");
  });

  it("calls a window at the norm about the norm, with a middling fit", () => {
    const read = seasonalFromSeries(daily(400, () => 40), now);
    expect(read?.fit).toBe(50);
    expect(read?.label).toContain("about at the term's yearly norm");
  });
});

describe("levelKindOf", () => {
  it("maps metric types to the curve the volume fallback uses", () => {
    expect(levelKindOf("search_volume")).toBe("search_volume");
    expect(levelKindOf("search_interest")).toBe("search_interest");
    expect(levelKindOf("shortform_views")).toBe("shortform_views");
    expect(levelKindOf("conversation")).toBe("conversation");
    expect(levelKindOf("news_coverage")).toBe("conversation");
    expect(levelKindOf("steady_demand")).toBe("index");
    expect(levelKindOf(null)).toBe("index");
  });
});

describe("actionPctFor", () => {
  const term = signal({ source: "dataforseo", metric_type: "search_volume", value: 1000 });

  it("takes the shares-and-saves rate from the biggest short-form read on the term", () => {
    const reads = [
      signal({ id: "a", raw: { actionPct: 0.4, views: 3000 } }),
      signal({ id: "b", raw: { actionPct: 1.5, views: 12_000 } }),
      signal({ id: "c", normalized_term: "other", raw: { actionPct: 9, views: 90_000 } }),
    ];
    expect(actionPctFor(term, reads)).toBe(1.5);
  });

  it("ignores a read with too few views behind it, and terms with none", () => {
    expect(actionPctFor(term, [signal({ raw: { actionPct: 0, views: 471 } })])).toBeNull();
    expect(actionPctFor(term, [signal({ raw: { actionPct: 2 }, value: 500 })])).toBeNull();
    expect(actionPctFor(term, [])).toBeNull();
  });
});
