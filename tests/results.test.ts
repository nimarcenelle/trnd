import { describe, expect, it } from "vitest";

import { adStage } from "@/lib/diff";
import { parseAdsExport, parseCsv, rankResults } from "@/lib/results";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and newlines inside fields, and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });
});

describe("parseAdsExport", () => {
  const csv = `Reporting starts,Reporting ends,Ad name,Body,Amount spent (USD),Impressions,Link clicks,CTR (link click-through rate),Results,Result indicator,Cost per result,Purchase ROAS (return on ad spend)
2026-07-01,2026-09-30,UGC hair v2,"My hair stopped breaking, finally",4012.55,210000,3990,1.9,201,actions:offsite_conversion.fb_pixel_purchase,19.96,3.12
2026-07-01,2026-09-30,Sale 20%,,"3,000.00",150000,1200,0.8,50,actions:offsite_conversion.fb_pixel_purchase,60,0.9
,,,,7012.55,360000,5190,,251,,,`;
  it("finds the columns Ads Manager exports, and skips the totals row", () => {
    const rows = parseAdsExport(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ad_name: "UGC hair v2",
      body: "My hair stopped breaking, finally",
      spend: 4012.55,
      impressions: 210000,
      clicks: 3990,
      ctr: 1.9,
      results: 201,
      result_type: "purchase",
      cost_per_result: 19.96,
      roas: 3.12,
      period_start: "2026-07-01",
      period_end: "2026-09-30",
    });
    expect(rows[1]).toMatchObject({ spend: 3000, body: null });
  });
  it("says what's wrong when the export isn't at the ad level", () => {
    expect(() => parseAdsExport("Campaign name,Amount spent (USD)\nX,10")).toThrow(/Ad name/);
  });
});

describe("rankResults", () => {
  it("about a third each, never the same ad in both", () => {
    const five = [20, 27, 31, 44, 60].map((c) => ({ spend: 1000, cost_per_result: c, results: 10 }));
    const { best, worst } = rankResults(five);
    expect(best.map((r) => r.cost_per_result)).toEqual([20, 27]);
    expect(worst.map((r) => r.cost_per_result)).toEqual([60, 44]);
  });
  it("ranks by cost per result among ads with real spend", () => {
    const rows = [
      { spend: 4000, cost_per_result: 20, results: 200 },
      { spend: 3000, cost_per_result: 60, results: 50 },
      { spend: 5, cost_per_result: 1, results: 5 }, // too little spend to count
      { spend: 2000, cost_per_result: 30, results: 66 },
    ];
    const { best, worst } = rankResults(rows);
    expect(best.map((r) => r.cost_per_result)).toEqual([20]);
    expect(worst.map((r) => r.cost_per_result)).toEqual([60]);
  });
});

describe("adStage", () => {
  const ad = (startedDaysAgo: number, variants = 1, active = true) => ({
    active,
    variants,
    stopped_at: null,
    started_at: new Date(Date.parse("2026-10-15") - startedDaysAgo * 86_400_000).toISOString().slice(0, 10),
  });
  it("testing under two weeks, scaling with versions or a month, running between", () => {
    expect(adStage(ad(3, 5), "2026-10-15")).toBe("testing");
    expect(adStage(ad(20, 3), "2026-10-15")).toBe("scaling");
    expect(adStage(ad(45, 1), "2026-10-15")).toBe("scaling");
    expect(adStage(ad(20, 1), "2026-10-15")).toBe("running");
    expect(adStage(ad(20, 1, false), "2026-10-15")).toBe("stopped");
  });
});
