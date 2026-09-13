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
    expect(comp(s, "growth").detail).toBe("Coffee up 12%, faster than almost any recent stretch");
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
