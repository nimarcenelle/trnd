import { describe, expect, it } from "vitest";

import { crossedProven, daysRunning, PROVEN_DAYS, isLaunch, readLooksPartial, backfillEvents, backfillStopped, unseenStopped } from "@/lib/diff";
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

describe("a first sighting is a launch only when the ad is new", () => {
  it("counts an ad that started since the last read, and one with no date on a complete read", () => {
    expect(isLaunch({ started_at: "2026-10-14" }, "2026-10-15T15:03:08Z", true)).toBe(true);
    expect(isLaunch({ started_at: "2026-10-13" }, "2026-10-15T15:03:08Z", true)).toBe(true);
    expect(isLaunch({ started_at: null }, "2026-10-15T15:03:08Z", true)).toBe(true);
  });
  it("does not count an ad that started weeks before but sat outside the read's cap, nor a baseline read", () => {
    expect(isLaunch({ started_at: "2026-09-10" }, "2026-10-15T15:03:08Z", false)).toBe(false);
    expect(isLaunch({ started_at: "2026-09-10" }, "2026-10-15T15:03:08Z", true)).toBe(false);
    expect(isLaunch({ started_at: null }, "2026-10-15T15:03:08Z", false)).toBe(false);
    expect(isLaunch({ started_at: "2026-10-15" }, null, true)).toBe(false);
  });
});

describe("a read with under half of last time's ads is partial", () => {
  it("flags AquaBliss's 9 of 33 and lets small or steady reads through", () => {
    expect(readLooksPartial(33, 9)).toBe(true);
    expect(readLooksPartial(33, 17)).toBe(false);
    expect(readLooksPartial(6, 1)).toBe(false);
    expect(readLooksPartial(0, 0)).toBe(false);
  });
});

describe("the first read writes the last 30 days from the ads' own dates", () => {
  const now = "2026-10-15T17:00:00Z";
  it("dates launches on their start day and proven ads on the day they crossed the line", () => {
    const ads = [
      { id: "a", started_at: "2026-10-10", active: true },
      { id: "b", started_at: "2026-09-20", active: true },
      { id: "c", started_at: "2026-08-01", active: true },
      { id: "d", started_at: "2026-10-01", active: false },
      { id: "e", started_at: null, active: true },
    ];
    const { launched, proven } = backfillEvents(ads, now);
    expect(launched.map((l) => l.ad.id)).toEqual(["a", "b"]);
    expect(launched[0].at).toBe("2026-10-10T12:00:00.000Z");
    expect(proven.map((l) => `${l.ad.id}@${l.at.slice(0, 10)}`)).toEqual(["b@2026-10-11"]);
  });
  it("keeps the stopped ads that ended inside the window", () => {
    const ended = [{ archiveId: "x", endedAt: "2026-10-12" }, { archiveId: "y", endedAt: "2026-08-30" }, { archiveId: "z", endedAt: null }];
    expect(backfillStopped(ended, now).map((s) => `${s.ad.archiveId}@${s.at.slice(0, 10)}`)).toEqual(["x@2026-10-12"]);
  });
});

describe("an ad unseen for days of reads has stopped", () => {
  const now = "2026-10-15T17:00:00Z";
  const ads = [
    { archive_id: "fresh", active: true, last_seen_at: "2026-10-14T17:00:00Z" },
    { archive_id: "gone", active: true, last_seen_at: "2026-10-11T17:00:00Z" },
    { archive_id: "old-stopped", active: false, last_seen_at: "2026-10-01T17:00:00Z" },
  ];
  it("stops the ad not seen in three days while the Page kept being read", () => {
    expect(unseenStopped(ads, new Set(["fresh"]), (a) => a.archive_id, now, "2026-10-14T17:00:00Z").map((a) => a.archive_id)).toEqual(["gone"]);
  });
  it("stops nothing when the Page itself was not read lately, or this read saw the ad", () => {
    expect(unseenStopped(ads, new Set(["fresh"]), (a) => a.archive_id, now, "2026-10-05T17:00:00Z")).toEqual([]);
    expect(unseenStopped(ads, new Set(["fresh", "gone"]), (a) => a.archive_id, now, "2026-10-14T17:00:00Z")).toEqual([]);
    expect(unseenStopped(ads, new Set(), (a) => a.archive_id, now, null)).toEqual([]);
  });
});
