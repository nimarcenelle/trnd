import { describe, expect, it } from "vitest";

import { angleMix, weeklyLaunches } from "@/lib/stats";

const now = Date.parse("2026-10-12T12:00:00Z");

describe("weeklyLaunches", () => {
  it("buckets start dates by week, this week last", () => {
    const ads = [{ started_at: "2026-10-11" }, { started_at: "2026-10-10" }, { started_at: "2026-09-30" }, { started_at: "2025-01-01" }, { started_at: null }];
    // Sep 30 is 12 days back: last week. Two this week. 2025 is out of range.
    expect(weeklyLaunches(ads, 4, now)).toEqual([0, 0, 1, 2]);
  });
});

describe("angleMix", () => {
  it("counts live ads per angle, case-insensitively, most-used first", () => {
    const ads = [
      { angle: "UGC testimonial", active: true },
      { angle: "ugc testimonial", active: true },
      { angle: "price anchor", active: true },
      { angle: "price anchor", active: false },
      { angle: null, active: true },
    ];
    expect(angleMix(ads)).toEqual([
      ["ugc testimonial", 2],
      ["price anchor", 1],
    ]);
  });
});
