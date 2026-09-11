import { describe, expect, it } from "vitest";

import { blendLearning, computeCpaCents, computeCtr, computeLift, RECENCY_FLOOR } from "../lib/results/compute";

const input = (over: Partial<Parameters<typeof computeLift>[0]> = {}) => ({
  impressions: null,
  clicks: null,
  spend_cents: null,
  bookings: null,
  revenue_cents: null,
  ...over,
});

describe("results math", () => {
  it("computes CTR", () => {
    expect(computeCtr(input({ impressions: 10000, clicks: 150 }))).toBe(0.015);
    expect(computeCtr(input({ impressions: 0, clicks: 5 }))).toBeNull();
    expect(computeCtr(input({ impressions: null, clicks: 5 }))).toBeNull();
  });

  it("computes cost per result preferring bookings", () => {
    expect(computeCpaCents(input({ clicks: 100, spend_cents: 10000, bookings: 10 }))).toBe(1000);
    expect(computeCpaCents(input({ clicks: 100, spend_cents: 10000 }))).toBe(100);
    expect(computeCpaCents(input({ spend_cents: 10000 }))).toBeNull();
  });

  it("maps performance to a 0..1 lift with 0.5 as neutral", () => {
    expect(computeLift(input())).toBe(0.5);
    const strong = computeLift(input({ impressions: 10000, clicks: 300, spend_cents: 20000, bookings: 12, revenue_cents: 120000 }));
    expect(strong).toBeGreaterThan(0.9);
    const weak = computeLift(input({ impressions: 10000, clicks: 30, spend_cents: 20000, bookings: 0, revenue_cents: 0 }));
    expect(weak).toBeLessThan(0.2);
  });

  it("scores CTR against the category's own benchmark", () => {
    // 1.2% CTR: at benchmark for auto services (1.1%), well under for a med
    // spa (1.8%). One global ceiling could not tell those apart.
    const read = input({ impressions: 10000, clicks: 120 });
    expect(computeLift(read, "Auto services")).toBeGreaterThan(computeLift(read, "Health & beauty"));
    expect(computeLift(read, "Auto services")).toBeGreaterThan(0.5);
    expect(computeLift(read, "Health & beauty")).toBeLessThan(0.5);
  });

  it("leaves an uncategorized read on the old generic ceiling", () => {
    // The generic benchmark is 1.5%, so 3% CTR still tops out — unchanged.
    expect(computeLift(input({ impressions: 10000, clicks: 150 }))).toBe(0.5);
    expect(computeLift(input({ impressions: 10000, clicks: 300 }))).toBe(1);
    expect(computeLift(input({ impressions: 10000, clicks: 150 }), "Nonexistent category")).toBe(0.5);
  });

  it("blends observations by sample size while the sample is small", () => {
    expect(blendLearning(null, 0.8)).toEqual({ lift: 0.8, sample_size: 1 });
    expect(blendLearning({ lift: 0.6, sample_size: 3 }, 1.0)).toEqual({ lift: 0.7, sample_size: 4 });
  });

  it("keeps the newest result at the recency floor once the sample is large", () => {
    // A plain mean would move a 40-result belief by 0.01; the floor makes the
    // newest evidence worth RECENCY_FLOOR of the estimate, always.
    const blended = blendLearning({ lift: 0.5, sample_size: 40 }, 1.0);
    const plainMean = (0.5 * 40 + 1.0) / 41; // ≈ 0.512
    expect(blended.lift).toBeCloseTo(0.5 + 0.5 * RECENCY_FLOOR, 1);
    expect(blended.lift).toBeGreaterThan(plainMean);
    expect(blended.sample_size).toBe(41);
  });

  it("counts what it knows even as what it believes decays", () => {
    let learning = { lift: 0.5, sample_size: 0 };
    for (let i = 0; i < 12; i++) learning = blendLearning(learning.sample_size ? learning : null, 0.9);
    expect(learning.sample_size).toBe(12);
    expect(learning.lift).toBeGreaterThan(0.8);
  });
});
