import { describe, expect, it } from "vitest";

import { absoluteGrowthScore, CULTURE_LOW_NOTE } from "../lib/scoring/culture";
import {
  lifecycleScore,
  lifecycleStage,
  NEUTRAL_PLACEHOLDER,
  scoreCulture,
  type CultureInput,
  type DailyPoint,
} from "../lib/scoring/index";

const series = (values: number[]): DailyPoint[] =>
  values.map((value, i) => ({ day: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`, value }));
const weeks = (...levels: number[]) => series(levels.flatMap((v) => Array(7).fill(v)));

const growthBaseline = [-10, -5, 0, 2, 4, 6, 8, 10, 12, 15];

const full = (over: Partial<CultureInput> = {}): CultureInput => ({
  term: "matcha latte",
  category: "Coffee",
  categoryGrowthPct: 12,
  categoryGrowthBaseline: growthBaseline,
  seasonal: { inWindow: true, daysOut: 0, label: "Back to school" },
  series: weeks(10, 15),
  ...over,
});

const comp = (s: ReturnType<typeof scoreCulture>, key: string) => s.components.find((c) => c.key === key)!;

describe("lifecycleStage", () => {
  it("needs 14 points", () => {
    expect(lifecycleStage(series(Array(13).fill(5)))).toBeNull();
  });

  it("reads each stage from the series shape", () => {
    expect(lifecycleStage(weeks(100, 10, 20))).toBe("emerging");
    expect(lifecycleStage(weeks(100, 50, 70))).toBe("growing");
    expect(lifecycleStage(weeks(10, 15))).toBe("growing");
    expect(lifecycleStage(weeks(50, 100, 102))).toBe("peaking");
    expect(lifecycleStage(weeks(50, 100, 80))).toBe("declining");
    expect(lifecycleStage(weeks(100, 100, 100))).toBe("flat");
    expect(lifecycleStage(weeks(0, 0))).toBe("flat");
  });

  it("scores stages so rising beats rolling over", () => {
    expect(lifecycleScore("emerging")).toBe(90);
    expect(lifecycleScore("growing")).toBe(80);
    expect(lifecycleScore("flat")).toBe(50);
    expect(lifecycleScore("peaking")).toBe(35);
    expect(lifecycleScore("declining")).toBe(15);
  });
});

describe("culture mappings", () => {
  it("maps growth on the absolute fallback curve", () => {
    expect(absoluteGrowthScore(-60)).toBe(0);
    expect(absoluteGrowthScore(-50)).toBe(0);
    expect(absoluteGrowthScore(-25)).toBe(20);
    expect(absoluteGrowthScore(0)).toBe(40);
    expect(absoluteGrowthScore(25)).toBe(70);
    expect(absoluteGrowthScore(50)).toBe(100);
    expect(absoluteGrowthScore(80)).toBe(100);
  });

  it("ranks growth against the category's own baseline", () => {
    const s = scoreCulture(full());
    expect(comp(s, "growth").score).toBe(85);
    expect(comp(s, "growth").detail).toBe("Coffee up 12% this week, faster than almost any recent stretch");
  });

  it("reads a year of category volume as the growth, and names the term's own year beside it", () => {
    const s = scoreCulture(full({ categoryGrowthPct: 22, categoryGrowthBasis: "year", categoryGrowthBaseline: [], yearOverYearPct: 34 }));
    // Half the category's year, half the term's own: 22% is 66.4 and 34% is 80.8 on the absolute curve.
    expect(comp(s, "growth").score).toBe(73.6);
    expect(comp(s, "growth").detail).toBe("Searches across coffee up 22% on a year ago; searches for this term up 34% on a year ago");
  });

  it("stands on the term's own year when the category has no growth reading", () => {
    const s = scoreCulture(full({ categoryGrowthPct: null, categoryGrowthBaseline: [], yearOverYearPct: -20 }));
    expect(comp(s, "growth").score).toBe(24);
    expect(comp(s, "growth").detail).toBe("Searches for this term down 20% on a year ago");
    expect(s.confidence).toBe("medium");
  });

  it("maps seasonal fit", () => {
    expect(comp(scoreCulture(full()), "seasonal").score).toBe(90);
    const near = scoreCulture(full({ seasonal: { inWindow: false, daysOut: 10, label: "Pumpkin spice" } }));
    expect(comp(near, "seasonal").score).toBe(70);
    expect(comp(near, "seasonal").detail).toBe("Pumpkin spice starts in 10 days");
    expect(comp(scoreCulture(full({ seasonal: { inWindow: false, daysOut: 40, label: null } })), "seasonal").score).toBe(30);
    expect(comp(scoreCulture(full({ seasonal: null })), "seasonal").score).toBeNull();
  });

  it("describes the lifecycle plainly", () => {
    expect(comp(scoreCulture(full({ series: weeks(100, 50, 70) })), "lifecycle").detail).toBe(
      "Rising: up 40% on the week before and still below its peak",
    );
  });
});

describe("scoreCulture", () => {
  it("scores a small rising trend above a bigger peaking one", () => {
    const small = scoreCulture(full({ categoryGrowthPct: 12, series: weeks(10, 15) }));
    const big = scoreCulture(full({ categoryGrowthPct: 15, series: weeks(5000, 10000, 10100) }));
    expect(comp(small, "lifecycle").score).toBe(80);
    expect(comp(big, "lifecycle").score).toBe(35);
    expect(comp(big, "growth").score!).toBeGreaterThan(comp(small, "growth").score!);
    expect(small.confidence).toBe("high");
    expect(big.confidence).toBe("high");
    expect(small.score).toBeGreaterThan(big.score);
  });

  it("is high with a full baseline, a known season and a stage", () => {
    const s = scoreCulture(full());
    expect(s.confidence).toBe("high");
    expect(s.score).toBe(Math.round(((40 * 85 + 30 * 90 + 30 * 80) / 100) * 10) / 10);
    expect(s.note).toBeNull();
  });

  it("falls back to the absolute curve on a thin baseline and caps at medium", () => {
    const s = scoreCulture(full({ categoryGrowthPct: 25, categoryGrowthBaseline: [1, 2] }));
    expect(comp(s, "growth").score).toBe(70);
    expect(s.confidence).toBe("medium");
  });

  it("redistributes weight when the season is unknown", () => {
    const s = scoreCulture(full({ seasonal: null }));
    expect(s.confidence).toBe("medium");
    expect(s.score).toBe(Math.round(((40 * 85 + 30 * 80) / 70) * 10) / 10);
  });

  it("is low with no growth reading and under 14 days of series", () => {
    const s = scoreCulture(full({ categoryGrowthPct: null, series: series([1, 2, 3]) }));
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(CULTURE_LOW_NOTE);
  });

  it("is medium with no growth reading but a readable series", () => {
    expect(scoreCulture(full({ categoryGrowthPct: null })).confidence).toBe("medium");
  });

  it("writes plain details with no em dashes, arrows or jargon", () => {
    for (const c of scoreCulture(full({ series: [] })).components) {
      expect(c.detail).toBeTruthy();
      expect(c.detail).not.toMatch(/[—→]|percentile/i);
    }
  });
});

describe("a rise that happened last week", () => {
  it("still reads as growing, not holding steady", async () => {
    const { lifecycleStage } = await import("../lib/scoring/lifecycle");
    // Three weeks around 100, then two weeks around 190 and 205: 93% above
    // the month before it, only 8% above the week before.
    const days = [...Array(16).fill(100), ...Array(7).fill(190), ...Array(7).fill(205)];
    const series = days.map((v, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, value: v }));
    expect(lifecycleStage(series)).toBe("growing");
  });
});

describe("moves that happened weeks ago", () => {
  const day = (i: number) => new Date(Date.UTC(2026, 5, 1) + i * 86400_000).toISOString().slice(0, 10);
  const toSeries = (values: number[]) => values.map((value, i) => ({ day: day(i), value }));

  it("reads a jump from nothing that has held for three weeks as growing", async () => {
    const { readLifecycle } = await import("../lib/scoring/lifecycle");
    // eskiin's "brassy blonde hair": zeros, then about 23 and holding.
    const values = [...Array(69).fill(0), ...Array(21).fill(0).map((_, i) => 22 + (i % 4))];
    const read = readLifecycle(toSeries(values))!;
    expect(read.stage).toBe("growing");
    expect(read.basis).toBe("quarter");
    const { scoreCulture } = await import("../lib/scoring/culture");
    const lifecycle = scoreCulture({ term: "t", category: "c", categoryGrowthPct: null, categoryGrowthBaseline: [], seasonal: null, series: toSeries(values) }).components.find((c) => c.key === "lifecycle")!;
    expect(lifecycle.detail).toBe("Rising: up from almost nothing three months ago, and holding at its new level");
  });

  it("reads a slow slide over the quarter as declining", async () => {
    const { readLifecycle } = await import("../lib/scoring/lifecycle");
    // eskiin's "hard water": about 83 a quarter ago, about 45 now, flat week to week.
    const values = Array(90).fill(0).map((_, i) => Math.round(83 - (38 * Math.min(i, 69)) / 69));
    const read = readLifecycle(toSeries(values))!;
    expect(read.stage).toBe("declining");
    expect(read.basis).toBe("quarter");
  });

  it("leaves a short series to the weekly read", async () => {
    const { readLifecycle } = await import("../lib/scoring/lifecycle");
    expect(readLifecycle(toSeries(Array(30).fill(40)))!.quarterChange).toBeNull();
  });
});


describe("seasonal fit from the term's own year", () => {
  it("uses the measured fit over the calendar when a year of history answered it", () => {
    const s = scoreCulture(full({ seasonal: { inWindow: true, daysOut: null, label: "This time last year ran 40% above the term's yearly norm", fit: 86 } }));
    expect(comp(s, "seasonal").score).toBe(86);
    expect(comp(s, "seasonal").detail).toBe("This time last year ran 40% above the term's yearly norm");
  });

  it("falls back to the calendar window when no fit was measured", () => {
    const s = scoreCulture(full({ seasonal: { inWindow: true, daysOut: 0, label: "Back to school", fit: null } }));
    expect(comp(s, "seasonal").score).toBe(90);
    expect(comp(s, "seasonal").detail).toBe("In season now: Back to school");
  });
});
