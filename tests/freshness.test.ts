import { describe, expect, it } from "vitest";

import { isExpiredMoment, readMoment } from "../lib/recommend/freshness";

describe("dated moment expiry", () => {
  // The real failure: served 2026-09-12, Labor Day 2026 was Sep 7.
  const sep12 = new Date("2026-09-12T12:00:00Z");

  it("knows Labor Day has passed — the bug that put it at #1", () => {
    const m = readMoment("labor day weekend", sep12)!;
    expect(m.label).toBe("Labor Day");
    expect(m.date.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(m.daysOut).toBeLessThan(0);
    expect(m.expired).toBe(true);
  });

  it("catches the hashtag spellings too", () => {
    expect(isExpiredMoment("ldw", sep12)).toBe(true);
    expect(isExpiredMoment("laborday2026", sep12)).toBe(true);
    expect(isExpiredMoment("labor day plans", sep12)).toBe(true);
    expect(isExpiredMoment("labor day bookings", sep12)).toBe(true);
  });

  it("does not expire the moment on the day itself", () => {
    expect(isExpiredMoment("labor day", new Date("2026-09-07T12:00:00Z"))).toBe(false);
    // Still sellable the same evening; dead the morning after next.
    expect(isExpiredMoment("labor day", new Date("2026-09-08T12:00:00Z"))).toBe(false);
    expect(isExpiredMoment("labor day", new Date("2026-09-09T12:00:00Z"))).toBe(true);
  });

  it("keeps a moment that is still ahead", () => {
    const m = readMoment("halloween", sep12)!;
    expect(m.daysOut).toBeGreaterThan(0);
    expect(m.expired).toBe(false);
  });

  it("pins the occurrence when the term carries a year", () => {
    // Asked in 2027 about a 2026 hashtag: still the 2026 date, still dead.
    const m = readMoment("laborday2026", new Date("2027-03-01T00:00:00Z"))!;
    expect(m.date.getUTCFullYear()).toBe(2026);
    expect(m.expired).toBe(true);
  });

  it("reads an undated term as the nearest occurrence, not always the next", () => {
    // Mid-September, "labor day" means the one just gone.
    expect(readMoment("labor day", sep12)!.date.toISOString().slice(0, 10)).toBe("2026-09-07");
    // In June it means the one coming.
    expect(readMoment("labor day", new Date("2026-06-01T00:00:00Z"))!.daysOut).toBeGreaterThan(0);
  });

  it("computes floating holidays, not just fixed dates", () => {
    // Thanksgiving 2026 is the 4th Thursday of November: Nov 26.
    expect(readMoment("thanksgiving", new Date("2026-11-01T00:00:00Z"))!.date.toISOString().slice(0, 10))
      .toBe("2026-11-26");
    // Black Friday is the day after.
    expect(readMoment("black friday", new Date("2026-11-01T00:00:00Z"))!.date.toISOString().slice(0, 10))
      .toBe("2026-11-27");
    // Memorial Day 2026 is the last Monday of May: May 25.
    expect(readMoment("memorial day", new Date("2026-05-01T00:00:00Z"))!.date.toISOString().slice(0, 10))
      .toBe("2026-05-25");
  });

  it("leaves ordinary product terms alone", () => {
    for (const t of ["brown sugar oat latte", "hidden cafe chapel hill", "cold plunge", "pour over coffee"]) {
      expect(readMoment(t, sep12)).toBeNull();
      expect(isExpiredMoment(t, sep12)).toBe(false);
    }
  });

  it("does not fire on a word that merely contains a holiday name", () => {
    // "Labored" is not Labor Day; the match is on whole tokens.
    expect(readMoment("labored breathing clinic", sep12)).toBeNull();
  });
});
