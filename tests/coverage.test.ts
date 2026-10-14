import { describe, expect, it } from "vitest";

import { coverage, overallCoverage } from "@/lib/coverage";

const now = Date.parse("2026-10-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const base = { page_id: "1", page_source: "checked" as const, last_error: null, last_scraped_at: hoursAgo(2), website: "x.com", email_status: "receiving" as const, site_checked_at: hoursAgo(2) };

describe("coverage", () => {
  it("gives full marks to a company read fully today, with engagement, site and emails", () => {
    const c = coverage(
      { ...base, health: { ads: { at: hoursAgo(2), ok: true, count: 30, via: "worker" }, site: { at: hoursAgo(2), ok: true, count: 12 } } },
      { activeAds: 30, engagedAds: 12, inbox: true, now },
    );
    expect(c).toMatchObject({ score: 100, label: "solid", gap: null });
  });

  it("is blind when the ads read failed, and says why", () => {
    const c = coverage(
      { ...base, page_source: null, last_error: "Apify answered 402", health: { ads: { at: hoursAgo(1), ok: false, note: "402" } } },
      { activeAds: 0, engagedAds: 0, inbox: false, now },
    );
    expect(c.parts).toMatchObject({ page: 18, ads: 0, quality: 0, engagement: 0, email: 0 });
    expect(c.label).toBe("blind");
    expect(c.gap).toBe("ads not read");
  });

  it("marks down stale, EU-only and unmatched reads", () => {
    const c = coverage(
      { ...base, health: { ads: { at: hoursAgo(50), ok: true, count: 20, via: "api" }, site: { at: hoursAgo(50), ok: true } } },
      { activeAds: 20, engagedAds: 2, inbox: true, now },
    );
    expect(c.parts).toEqual({ page: 25, ads: 20, quality: 6, engagement: 4, site: 5, email: 5 });
    expect(c.label).toBe("thin");
  });

  it("averages over companies", () => {
    expect(overallCoverage([100, 40])).toEqual({ score: 70, label: "thin" });
    expect(overallCoverage([])).toBeNull();
  });
});
