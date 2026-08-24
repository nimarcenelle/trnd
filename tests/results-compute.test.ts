import { describe, expect, it } from "vitest";

import { blendLearning, computeCpaCents, computeCtr, computeLift } from "../lib/results/compute";

describe("results math", () => {
  it("computes CTR", () => {
    expect(computeCtr({ impressions: 10000, clicks: 150, spend_cents: null, bookings: null, revenue_cents: null })).toBe(0.015);
    expect(computeCtr({ impressions: 0, clicks: 5, spend_cents: null, bookings: null, revenue_cents: null })).toBeNull();
    expect(computeCtr({ impressions: null, clicks: 5, spend_cents: null, bookings: null, revenue_cents: null })).toBeNull();
  });

  it("computes cost per result preferring bookings", () => {
    expect(computeCpaCents({ impressions: null, clicks: 100, spend_cents: 10000, bookings: 10, revenue_cents: null })).toBe(1000);
    expect(computeCpaCents({ impressions: null, clicks: 100, spend_cents: 10000, bookings: null, revenue_cents: null })).toBe(100);
    expect(computeCpaCents({ impressions: null, clicks: null, spend_cents: 10000, bookings: null, revenue_cents: null })).toBeNull();
  });

  it("maps performance to a 0..1 lift with 0.5 as neutral", () => {
    const neutral = computeLift({ impressions: null, clicks: null, spend_cents: null, bookings: null, revenue_cents: null });
    expect(neutral).toBe(0.5);
    const strong = computeLift({ impressions: 10000, clicks: 300, spend_cents: 20000, bookings: 12, revenue_cents: 120000 });
    expect(strong).toBeGreaterThan(0.9);
    const weak = computeLift({ impressions: 10000, clicks: 30, spend_cents: 20000, bookings: 0, revenue_cents: 0 });
    expect(weak).toBeLessThan(0.2);
  });

  it("blends observations by sample size", () => {
    expect(blendLearning(null, 0.8)).toEqual({ lift: 0.8, sample_size: 1 });
    expect(blendLearning({ lift: 0.6, sample_size: 3 }, 1.0)).toEqual({ lift: 0.7, sample_size: 4 });
  });
});
