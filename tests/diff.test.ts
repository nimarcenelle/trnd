import { describe, expect, it } from "vitest";

import { crossedProven, daysRunning, PROVEN_DAYS } from "@/lib/diff";
import { isScanning } from "@/lib/format";

describe("daysRunning", () => {
  it("counts to today, or to the day the ad stopped", () => {
    expect(daysRunning({ started_at: "2026-09-01", stopped_at: null }, "2026-10-01")).toBe(30);
    expect(daysRunning({ started_at: "2026-09-01", stopped_at: "2026-09-11T08:00:00Z" }, "2026-10-01")).toBe(10);
    expect(daysRunning({ started_at: null, stopped_at: null }, "2026-10-01")).toBeNull();
  });
});

describe("crossedProven", () => {
  const ad = (started: string, active = true) => ({ started_at: started, stopped_at: null, active });
  it("flags ads that passed the line since the last scan, once", () => {
    const now = "2026-10-12";
    const justCrossed = ad("2026-09-21"); // 21 days today, 20 yesterday
    const longProven = ad("2026-08-01");
    const young = ad("2026-10-01");
    const stopped = ad("2026-09-21", false);
    expect(PROVEN_DAYS).toBe(21);
    expect(crossedProven([justCrossed, longProven, young, stopped], "2026-10-11T10:00:00Z", now)).toEqual([justCrossed]);
  });
  it("flags nothing on a baseline scan", () => {
    expect(crossedProven([ad("2026-01-01")], null, "2026-10-12")).toEqual([]);
  });
});

describe("isScanning", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  it("treats a run that outlived its function as dead", () => {
    expect(isScanning({ scan_status: "running", scan_started_at: "2026-10-12T11:58:00Z" }, now)).toBe(true);
    expect(isScanning({ scan_status: "running", scan_started_at: "2026-10-12T11:00:00Z" }, now)).toBe(false);
    expect(isScanning({ scan_status: "idle", scan_started_at: "2026-10-12T11:58:00Z" }, now)).toBe(false);
  });
});
