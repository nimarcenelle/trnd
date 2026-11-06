import { describe, expect, it } from "vitest";

import { lastSlot, nextSlot, planSlotDue, streakOf } from "@/lib/creators/schedule";

const iso = (ms: number) => new Date(ms).toISOString();

describe("plan slot: Tuesday 8 AM local", () => {
  it("finds this week's Tuesday 8 AM in New York (EST, UTC-5)", () => {
    // Friday 2026-11-06 12:00 UTC → Tuesday 2026-11-03 08:00 EST = 13:00 UTC.
    expect(iso(lastSlot(Date.parse("2026-11-06T12:00:00Z"), "America/New_York"))).toBe("2026-11-03T13:00:00.000Z");
  });
  it("goes back a week before 8 AM on a Tuesday, and handles daylight saving", () => {
    // Tuesday 2026-11-03 07:00 EST is before the slot → the slot is Tuesday 2026-10-27 08:00 EDT = 12:00 UTC.
    expect(iso(lastSlot(Date.parse("2026-11-03T12:00:00Z"), "America/New_York"))).toBe("2026-10-27T12:00:00.000Z");
  });
  it("uses the creator's zone, and falls back to New York for a bad one", () => {
    expect(iso(lastSlot(Date.parse("2026-11-06T12:00:00Z"), "Asia/Tokyo"))).toBe("2026-11-02T23:00:00.000Z");
    expect(lastSlot(Date.parse("2026-11-06T12:00:00Z"), "Not/AZone")).toBe(lastSlot(Date.parse("2026-11-06T12:00:00Z"), "America/New_York"));
    expect(iso(nextSlot(Date.parse("2026-11-06T12:00:00Z"), "America/New_York"))).toBe("2026-11-10T13:00:00.000Z");
  });
  it("is due when no plan landed since the slot", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(planSlotDue(null, "America/New_York", now)).toBe(true);
    expect(planSlotDue("2026-11-03T13:05:00Z", "America/New_York", now)).toBe(false);
    expect(planSlotDue("2026-11-02T20:00:00Z", "America/New_York", now)).toBe(true);
  });
});

describe("streakOf", () => {
  const now = Date.parse("2026-11-06T12:00:00Z"); // this plan week began Tue 11-03 13:00 UTC
  it("counts plan weeks in a row with a post, this week included once it has one", () => {
    expect(streakOf(["2026-11-04T10:00:00Z", "2026-10-28T10:00:00Z", "2026-10-21T10:00:00Z"], "America/New_York", now)).toBe(3);
  });
  it("doesn't reset before this week's post, and stops at a missed week", () => {
    expect(streakOf(["2026-10-28T10:00:00Z", "2026-10-21T10:00:00Z", "2026-10-01T10:00:00Z"], "America/New_York", now)).toBe(2);
    expect(streakOf([], "America/New_York", now)).toBe(0);
  });
});
