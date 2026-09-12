import { describe, expect, it } from "vitest";

import {
  demandPoints,
  pointsCaption,
  pointsFromReach,
  reachFromPoints,
  weeklyReach,
} from "../lib/demand/points";

describe("weekly reach conversion", () => {
  it("turns monthly search volume into a weekly rate", () => {
    // 4345 searches/month ≈ 1000/week at weight 1.
    expect(weeklyReach({ source: "dataforseo", metricType: "search_volume", value: 4345 })).toBeCloseTo(1000, 0);
  });

  it("discounts views hard against searches", () => {
    const searches = weeklyReach({ source: "dataforseo", metricType: "search_volume", value: 4345 })!;
    const views = weeklyReach({ source: "youtube", metricType: "shortform_views", value: 50_000 })!;
    // 50k views is worth a thousand weekly searches, not fifty thousand:
    // being shown a video is not the same act as typing the thing in.
    expect(views).toBe(1000);
    expect(views).toBeCloseTo(searches, 0);
  });

  it("refuses to invent a number from a self-relative index", () => {
    // "63 out of its own peak" says nothing about how many people that is.
    expect(weeklyReach({ source: "google_trends", metricType: "search_interest", value: 63 })).toBeNull();
  });

  it("treats absent and zero reads as no read, never as zero demand", () => {
    expect(weeklyReach({ source: "dataforseo", metricType: "search_volume", value: null })).toBeNull();
    expect(weeklyReach({ source: "dataforseo", metricType: "search_volume", value: 0 })).toBeNull();
  });
});

describe("the points scale", () => {
  it("is fixed, so a pick's number does not move when another pick moves", () => {
    // The whole reason the scale is absolute rather than a percentile.
    expect(pointsFromReach(1000)).toBe(pointsFromReach(1000));
    expect(pointsFromReach(1000)).toBe(40);
  });

  it("is logarithmic, so local terms are not crushed into the axis", () => {
    const small = pointsFromReach(100)!;
    const mid = pointsFromReach(10_000)!;
    const large = pointsFromReach(1_000_000)!;
    // Each 100x step is an equal climb, not a vanishing one.
    expect(mid - small).toBe(large - mid);
    expect(small).toBeGreaterThan(0);
  });

  it("clamps rather than running off the top", () => {
    expect(pointsFromReach(50_000_000)).toBe(100);
    expect(pointsFromReach(1)).toBe(0);
  });

  it("round-trips points back to the reach they stand for", () => {
    for (const reach of [50, 1_000, 25_000, 400_000]) {
      const pts = pointsFromReach(reach)!;
      // Within the rounding of a 0-100 integer scale.
      expect(Math.abs(Math.log10(reachFromPoints(pts)) - Math.log10(reach))).toBeLessThan(0.1);
    }
  });
});

describe("demand points across sources", () => {
  it("adds reach across sources and names what contributed", () => {
    const out = demandPoints([
      { source: "dataforseo", metricType: "search_volume", value: 4345 },
      { source: "youtube", metricType: "shortform_views", value: 50_000 },
    ]);
    expect(out.reach).toBe(2000);
    expect(out.contributing).toEqual(["dataforseo", "youtube"]);
    expect(out.points).toBe(pointsFromReach(2000));
  });

  it("reports index-only sources separately instead of silently dropping them", () => {
    const out = demandPoints([
      { source: "dataforseo", metricType: "search_volume", value: 4345 },
      { source: "google_trends", metricType: "search_interest", value: 63 },
    ]);
    expect(out.contributing).toEqual(["dataforseo"]);
    expect(out.indexOnly).toEqual(["google_trends"]);
  });

  it("returns no points at all rather than a fake zero when nothing is measurable", () => {
    const out = demandPoints([{ source: "google_trends", metricType: "search_interest", value: 63 }]);
    expect(out.points).toBeNull();
    expect(out.reach).toBeNull();
    expect(pointsCaption(out)).toBeNull();
  });

  it("says what the number means in people, not just in points", () => {
    const out = demandPoints([{ source: "dataforseo", metricType: "search_volume", value: 43_450 }]);
    expect(pointsCaption(out)).toContain("10K weekly touches");
  });

  it("cannot let one viral video outrank a metro of real buyers", () => {
    const viral = demandPoints([{ source: "youtube", metricType: "shortform_views", value: 2_000_000 }]);
    const buyers = demandPoints([{ source: "dataforseo", metricType: "search_volume", value: 260_000 }]);
    expect(buyers.points!).toBeGreaterThan(viral.points!);
  });
});

import { buildDemandLine } from "../lib/demand/series";
import type { Signal } from "../lib/db/types";

describe("the eight-week demand line", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const sig = (daysAgo: number, over: Partial<Signal> = {}): Signal =>
    ({
      id: `s${daysAgo}`, source: "dataforseo", term: "cold plunge",
      normalized_term: "cold_plunge", category: "Health & beauty", geo: "US-NY",
      metric_type: "search_volume", value: 4345, delta_pct: null, window_days: 7,
      captured_at: new Date(now.getTime() - daysAgo * 86400_000).toISOString(),
      raw: null, ...over,
    }) as Signal;

  it("buckets signals into weeks and scores each week on its own", () => {
    const line = buildDemandLine([sig(1), sig(8), sig(15)], [], now);
    expect(line.weeks).toHaveLength(3);
    expect(line.weeks.every((w) => w.points > 0)).toBe(true);
  });

  it("takes the latest read per source in a week, never the sum of seven days", () => {
    // A steady term read daily must not report seven times the demand.
    const daily = [1, 2, 3, 4, 5, 6].map((d) => sig(d));
    const one = buildDemandLine([sig(1)], [], now);
    const many = buildDemandLine(daily, [], now);
    expect(many.weeks[many.weeks.length - 1].points).toBe(one.weeks[one.weeks.length - 1].points);
  });

  it("adds across sources within a week", () => {
    const both = buildDemandLine(
      [sig(1), sig(1, { id: "y", source: "youtube", metric_type: "shortform_views", value: 50_000 })],
      [],
      now,
    );
    const searchOnly = buildDemandLine([sig(1)], [], now);
    expect(both.weeks[0].points).toBeGreaterThan(searchOnly.weeks[0].points);
  });

  it("omits a week nothing was measured in rather than drawing through the gap", () => {
    // Weeks 1 and 3 measured, week 2 silent: three buckets would imply we
    // know demand held through the gap.
    const line = buildDemandLine([sig(1), sig(15)], [], now);
    expect(line.weeks).toHaveLength(2);
  });

  it("gives no caption and no points when only self-relative indices exist", () => {
    const line = buildDemandLine(
      [sig(1, { source: "google_trends", metric_type: "search_interest", value: 63 })],
      [],
      now,
    );
    expect(line.weeks).toHaveLength(0);
    expect(line.caption).toBeNull();
    expect(line.current).toBeNull();
  });

  it("reports week-over-week movement in points", () => {
    const line = buildDemandLine(
      [sig(1, { value: 43_450 }), sig(8, { value: 4_345 })],
      [],
      now,
    );
    expect(line.deltaPct).not.toBeNull();
    expect(line.deltaPct!).toBeGreaterThan(0);
  });

  it("falls back to the term's own shape when there is not enough absolute history", () => {
    // A business that onboarded today has one weekly bucket and cannot be
    // placed on the points scale — but sixty days of series may already exist.
    const series = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      normalized_term: "cold_plunge",
      geo: "US-NY",
      day: new Date(now.getTime() - (29 - i) * 86400_000).toISOString().slice(0, 10),
      value: 10 + i * 2,
    }));
    const line = buildDemandLine([sig(1)], series, now);
    expect(line.mode).toBe("relative");
    expect(line.weeks.length).toBeGreaterThanOrEqual(2);
    // Scaled against its own peak, so the newest week tops out.
    expect(line.weeks[line.weeks.length - 1].points).toBe(100);
    expect(line.caption).toMatch(/shape, not size/);
  });

  it("prefers real points over the shape whenever it has the history", () => {
    const line = buildDemandLine([sig(1), sig(8)], [{ id: "p", normalized_term: "x", geo: "US", day: "2026-09-01", value: 5 }], now);
    expect(line.mode).toBe("points");
  });
});
