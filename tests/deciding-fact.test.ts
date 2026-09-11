import { describe, expect, it } from "vitest";

import { decidingFact } from "../lib/recommend/insights";
import type { Signal } from "../lib/db/types";

const signal = (over: Partial<Signal> = {}): Signal =>
  ({
    id: "s1",
    source: "google_trends",
    term: "brow lamination",
    normalized_term: "brow_lamination",
    category: "Health & beauty",
    geo: "US-GA-524",
    metric_type: "search_interest",
    value: 60,
    delta_pct: 34,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: null,
    ...over,
  }) as Signal;

describe("the deciding fact", () => {
  it("leads with the move and where it was measured", () => {
    const fact = decidingFact(signal(), { geoLabel: "Atlanta metro" });
    expect(fact).toBe("“Brow lamination” is up 34% in the Atlanta metro this week.");
  });

  it("adds the open field when the rival read is thin", () => {
    expect(decidingFact(signal(), { geoLabel: "Atlanta metro", rivalAds: 0 })).toMatch(
      /nobody near you is advertising on it\.$/,
    );
    expect(decidingFact(signal(), { geoLabel: "Atlanta metro", rivalAds: 1 })).toMatch(
      /only 1 nearby business is advertising on it\.$/,
    );
    // A crowded field is not a selling point, so it goes unmentioned here.
    expect(decidingFact(signal(), { geoLabel: "Atlanta metro", rivalAds: 40 })).toMatch(/this week\.$/);
  });

  it("falls through to the empty field when nothing is moving", () => {
    const fact = decidingFact(signal({ delta_pct: 2 }), { geoLabel: "Atlanta metro", rivalAds: 0 });
    expect(fact).toMatch(/^Nobody near you is advertising on “Brow lamination”/);
  });

  it("falls through to fit when there's no movement and no rival read", () => {
    const fact = decidingFact(signal({ delta_pct: 1 }), {
      geoLabel: "Atlanta metro",
      serviceName: "Brow Lamination",
    });
    expect(fact).toMatch(/closest match to your Brow Lamination\.$/);
  });

  it("says nothing rather than dressing up a weak read", () => {
    expect(decidingFact(signal({ delta_pct: 3 }), { geoLabel: "Atlanta metro" })).toBeNull();
    expect(decidingFact(signal({ delta_pct: null }), { geoLabel: "" })).toBeNull();
    // A decline is never the reason to spend money on something.
    expect(decidingFact(signal({ delta_pct: -40 }), { geoLabel: "Atlanta metro" })).toBeNull();
  });

  it("calls a forecast window a forecast, never a measured rise", () => {
    const fact = decidingFact(
      signal({
        metric_type: "weather_trigger",
        source: "weather",
        delta_pct: 60,
        raw: { detail: "First 90°+ stretch of the year lands Thursday" },
      }),
      { geoLabel: "Atlanta metro", rivalAds: 0 },
    );
    expect(fact).toMatch(/^First 90°\+ stretch of the year lands Thursday/);
    expect(fact).not.toMatch(/up 60%/);
  });
});
