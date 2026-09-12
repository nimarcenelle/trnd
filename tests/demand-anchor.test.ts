import { describe, expect, it } from "vitest";

import { anchorTrendsToVolume } from "../lib/demand/anchor";

const now = new Date("2026-09-12T12:00:00Z");
/** A daily Trends index climbing steadily across eight weeks. */
const ramp = (from: number, to: number, days = 56) =>
  Array.from({ length: days }, (_, i) => ({
    day: new Date(now.getTime() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10),
    value: Math.round(from + ((to - from) * i) / (days - 1)),
  }));

describe("anchoring the Trends index to real search volume", () => {
  it("spreads the monthly volume across the weeks the index describes", () => {
    const weeks = anchorTrendsToVolume(43_450, ramp(50, 50), now);
    expect(weeks).toHaveLength(8);
    // A flat index means every week is the average week: volume / 4.345.
    for (const w of weeks) expect(w.searches).toBeCloseTo(10_000, -2);
  });

  it("makes a rising index read as rising searches", () => {
    const weeks = anchorTrendsToVolume(43_450, ramp(20, 100), now);
    const first = weeks[0].searches;
    const last = weeks[weeks.length - 1].searches;
    expect(last).toBeGreaterThan(first * 2);
    // The level still averages out to the real monthly volume.
    const mean = weeks.reduce((s, w) => s + w.searches, 0) / weeks.length;
    expect(mean).toBeCloseTo(10_000, -3);
  });

  it("gives nothing without a level — a shape is not a quantity", () => {
    expect(anchorTrendsToVolume(null, ramp(20, 100), now)).toEqual([]);
    expect(anchorTrendsToVolume(0, ramp(20, 100), now)).toEqual([]);
  });

  it("gives nothing without a shape — a level is not a weekly series", () => {
    expect(anchorTrendsToVolume(43_450, [], now)).toEqual([]);
  });

  it("refuses a window that is flat at zero rather than emitting zeroes", () => {
    expect(anchorTrendsToVolume(43_450, ramp(0, 0), now)).toEqual([]);
  });

  it("skips weeks the index never covered instead of interpolating them", () => {
    // Only the last fortnight was measured.
    const weeks = anchorTrendsToVolume(43_450, ramp(40, 60, 14), now);
    expect(weeks).toHaveLength(2);
  });

  it("never invents a negative week", () => {
    for (const w of anchorTrendsToVolume(100, ramp(0, 100), now)) {
      expect(w.searches).toBeGreaterThanOrEqual(0);
    }
  });
});
