import { describe, expect, it } from "vitest";

import type { Learning, Service, Signal } from "../lib/db/types";
import {
  competitorGap,
  historicalLift,
  matchService,
  normalizedDelta,
  scoreOpportunity,
} from "../lib/scoring";

const signal = (over: Partial<Signal> = {}): Signal => ({
  id: "s1",
  source: "seed",
  term: "facial balancing",
  normalized_term: "facial_balancing",
  category: "Health & beauty",
  geo: "US",
  metric_type: "conversation",
  value: 77,
  delta_pct: 38,
  window_days: 7,
  captured_at: new Date().toISOString(),
  raw: null,
  ...over,
});

const service = (name: string): Service => ({
  id: `svc-${name}`,
  business_id: "b1",
  name,
  description: null,
  price_cents: 9900,
  is_active: true,
});

describe("scoring components", () => {
  it("normalizes delta with saturation at +50%", () => {
    expect(normalizedDelta(0)).toBe(0);
    expect(normalizedDelta(25)).toBe(0.5);
    expect(normalizedDelta(50)).toBe(1);
    expect(normalizedDelta(500)).toBe(1);
    expect(normalizedDelta(null)).toBe(0.5);
  });

  it("matches services by token overlap", () => {
    const m = matchService(signal(), [service("Facial balancing consult"), service("Botox")]);
    expect(m.service?.name).toBe("Facial balancing consult");
    expect(m.score).toBeGreaterThan(0.6);
    const none = matchService(signal({ term: "cold plunge" }), [service("Botox")]);
    expect(none.service).toBeNull();
    expect(none.score).toBeLessThan(0.5);
  });

  it("treats low coverage as an open competitor gap", () => {
    expect(competitorGap({ coverageCount: 0 }).score).toBe(1);
    expect(competitorGap({ coverageCount: 15 }).score).toBe(0);
    expect(competitorGap({ coverageCount: null }).score).toBe(0.6);
  });

  it("uses neutral prior when learnings are empty", () => {
    expect(historicalLift([]).score).toBe(0.5);
    const l: Learning = {
      id: "l1", category: "Health & beauty", geo_bucket: "US",
      angle_type: "education", lift: 0.8, sample_size: 10,
      source: "measured" as const,
  updated_at: new Date().toISOString(),
    };
    expect(historicalLift([l]).score).toBeCloseTo(0.8);
  });
});

describe("scoreOpportunity", () => {
  it("produces a 0-10 score with a plain-English rationale", () => {
    const result = scoreOpportunity(
      signal(),
      [service("Facial balancing consult")],
      [],
      { coverageCount: 2 },
    );
    expect(result.score).toBeGreaterThan(5);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.rationale).toContain("facial balancing");
    expect(result.rationale).toContain("you already sell");
    expect(result.matchedService?.name).toBe("Facial balancing consult");
  });

  it("scores a perfect storm near the top of the range", () => {
    const result = scoreOpportunity(
      signal({ delta_pct: 60 }),
      [service("Facial balancing consult and filler")],
      [{
        id: "l1", category: "Health & beauty", geo_bucket: "US",
        angle_type: "education", lift: 0.9, sample_size: 20,
        source: "measured" as const,
  updated_at: new Date().toISOString(),
      }],
      { coverageCount: 0 },
    );
    expect(result.score).toBeGreaterThanOrEqual(8.5);
  });
});
