import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { MAX_AD_HISTORY_ROWS, parseAdExport } from "../lib/ads/import";
import { bestTheme, historyByTheme, historyOnTerm, readAdHistory } from "../lib/ads/history-read";
import type { AdHistory } from "../lib/db/types";

const bytes = (s: string) => new TextEncoder().encode(s);
const csv = (name: string, text: string) => parseAdExport({ name, mime: "text/csv", bytes: bytes(text) });

// Ads Manager export: the currency-suffixed spend column, a placement
// breakdown that repeats one ad, a CTR (all) percentage, a dead row, and the
// blank-campaign totals row Meta adds at the top or bottom.
const META_CSV = `Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Impressions,Link clicks,Amount spent (USD),Results,CTR (all),Body
2026-08-01,2026-08-15,Fall Promo,Locals 25-54,Pumpkin latte,"12,000",240,"$1,234.56",18,2.10%,$2 off pumpkin lattes
2026-08-01,2026-08-31,Fall Promo,Locals 25-54,Pumpkin latte,"3,000",60,$100.00,2,2.00%,$2 off pumpkin lattes
2026-08-01,2026-08-31,Brand,Everyone,Rated best coffee,5000,50,80.5,,1.00%,
2026-08-01,2026-08-31,Reach,Everyone,Awareness,2000,,10,,1.50%,
2026-08-01,2026-08-31,Tiny,Test,Tiny ad,0,0,0,,,
,,,,,"22,000",350,"1,425.06",20,1.80%,
`;

// Google Ads report download: title and date-range lines above the header,
// "--" for missing values, and the "Total:" footer rows.
const GOOGLE_CSV = `Ad performance report
"August 1, 2026 - August 31, 2026"
Campaign,Ad group,Headline 1,Description,Impr.,Clicks,Cost,Conversions,CTR,Currency code
Emergency Plumbing,Burst pipes,24/7 Emergency Plumber,Same-day repairs from licensed pros,"1,500",90,$210.00,6,6.00%,USD
Water Heaters,Tankless,Tankless Water Heater Install,Did you know tankless saves space?,800,8,40.00,--,1.00%,USD
Total: Account,--,--,--,"2,300",98,250.00,6,4.26%,USD
Total: Campaigns,--,--,--,"2,300",98,250.00,6,4.26%,USD
`;

describe("parseAdExport: Meta", () => {
  const read = csv("meta.csv", META_CSV);

  it("detects the platform by headers", () => {
    expect(read.platform).toBe("meta");
    expect(read.source).toBe("meta_export");
  });

  it("sums a repeated ad, skips the totals and dead rows", () => {
    expect(read.rows.map((r) => r.campaign_name)).toEqual(["Fall Promo", "Brand", "Reach"]);
    const promo = read.rows[0];
    expect(promo).toMatchObject({
      platform: "meta",
      ad_name: "Pumpkin latte",
      copy: "$2 off pumpkin lattes",
      impressions: 15000,
      clicks: 300,
      spend_cents: 133456,
      results: 20,
      started_on: "2026-08-01",
      ended_on: "2026-08-31",
      source: "meta_export",
    });
    expect(promo.ctr).toBeCloseTo(0.02, 6);
    expect(read.warnings.join(" ")).toContain("Skipped 1 row");
  });

  it("parses plain money and uses the percent CTR when clicks are missing", () => {
    expect(read.rows[1]).toMatchObject({ spend_cents: 8050, results: null, copy: null });
    expect(read.rows[1].ctr).toBeCloseTo(0.01, 6);
    expect(read.rows[2].clicks).toBeNull();
    expect(read.rows[2].ctr).toBeCloseTo(0.015, 6);
  });

  it("reads the same export as XLSX", () => {
    const aoa = [
      ["Campaign name", "Ad name", "Impressions", "Link clicks", "Amount spent (USD)", "CTR (all)", "Reporting starts"],
      ["Fall Promo", "Pumpkin latte", 15000, 300, 1334.56, 2.1, "2026-08-01"],
      ["Total", "", 15000, 300, 1334.56, 2.1, ""],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Report");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const x = parseAdExport({
      name: "meta.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: new Uint8Array(out),
    });
    expect(x.platform).toBe("meta");
    expect(x.rows.length).toBe(1);
    expect(x.rows[0]).toMatchObject({ impressions: 15000, clicks: 300, spend_cents: 133456, started_on: "2026-08-01" });
    expect(x.rows[0].ctr).toBeCloseTo(0.02, 6);
  });

  it("reads purchases, their value and the video plays when the export carries the columns", () => {
    const aoa = [
      ["Campaign name", "Ad name", "Impressions", "Link clicks", "Amount spent (USD)", "Purchases", "Purchases conversion value", "3-second video plays", "ThruPlays", "Reporting starts"],
      ["Fall Promo", "Pumpkin latte", 15000, 300, 1334.56, 20, 1810.5, 4200, 900, "2026-08-01"],
      ["Fall Promo", "Pumpkin latte", 5000, 100, 100, 5, 200, 800, 100, "2026-08-01"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Report");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const x = parseAdExport({ name: "meta.xlsx", mime: "application/octet-stream", bytes: new Uint8Array(out) });
    expect(x.rows).toHaveLength(1);
    expect(x.rows[0]).toMatchObject({ purchases: 25, purchase_value_cents: 201050, video_3s_views: 5000, thruplays: 1000 });
  });
});

describe("parseAdExport: Google Ads", () => {
  const read = csv("google.csv", GOOGLE_CSV);

  it("skips the title lines and the Total rows", () => {
    expect(read.platform).toBe("google");
    expect(read.source).toBe("google_export");
    expect(read.rows.length).toBe(2);
    expect(read.warnings).toEqual([]);
  });

  it("maps ad group, copy, cost and conversions", () => {
    expect(read.rows[0]).toMatchObject({
      campaign_name: "Emergency Plumbing",
      ad_name: "Burst pipes",
      copy: "24/7 Emergency Plumber Same-day repairs from licensed pros",
      impressions: 1500,
      clicks: 90,
      spend_cents: 21000,
      results: 6,
      started_on: null,
    });
    expect(read.rows[0].ctr).toBeCloseTo(0.06, 6);
    expect(read.rows[1].results).toBeNull();
  });

  it("reads a UTF-16 tab-separated download", () => {
    const tsv = [
      "Ad performance report",
      "August 1, 2026 - August 31, 2026",
      ["Campaign", "Ad group", "Impr.", "Clicks", "Cost"].join("\t"),
      ["Emergency Plumbing", "Burst pipes", "1,500", "90", "210.00"].join("\t"),
      ["Water Heaters", "Tankless", "800", "8", "40.00"].join("\t"),
      ["Total: Account", "--", "2,300", "98", "250.00"].join("\t"),
    ].join("\r\n");
    const le = new Uint8Array(2 + tsv.length * 2);
    le[0] = 0xff;
    le[1] = 0xfe;
    for (let i = 0; i < tsv.length; i++) {
      le[2 + i * 2] = tsv.charCodeAt(i) & 0xff;
      le[3 + i * 2] = tsv.charCodeAt(i) >> 8;
    }
    const r = parseAdExport({ name: "report.csv", mime: "text/csv", bytes: le });
    expect(r.platform).toBe("google");
    expect(r.rows.map((x) => x.impressions)).toEqual([1500, 800]);
  });
});

describe("parseAdExport: not an ad export", () => {
  it("warns instead of throwing", () => {
    const r = csv("sales.csv", "Item,Qty,Price\nLatte,3,4.50\nScone,2,3.25\n");
    expect(r.platform).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain("doesn't look like an ad export");
  });

  it("warns on an empty or binary-garbage file", () => {
    expect(csv("empty.csv", "").warnings.length).toBe(1);
    const junk = parseAdExport({ name: "x.xlsx", mime: "", bytes: new Uint8Array([0x50, 0x4b, 1, 2, 3]) });
    expect(junk.rows).toEqual([]);
    expect(junk.warnings.length).toBe(1);
  });

  it(`caps at ${MAX_AD_HISTORY_ROWS} ads, keeping the most-seen`, () => {
    const lines = ["Campaign name,Ad name,Impressions,Link clicks"];
    for (let i = 1; i <= MAX_AD_HISTORY_ROWS + 20; i++) lines.push(`C${i},A${i},${i * 10},1`);
    const r = csv("big.csv", lines.join("\n"));
    expect(r.rows.length).toBe(MAX_AD_HISTORY_ROWS);
    expect(r.rows[0].impressions).toBe((MAX_AD_HISTORY_ROWS + 20) * 10);
    expect(r.warnings.some((w) => w.includes(String(MAX_AD_HISTORY_ROWS)))).toBe(true);
  });
});

/* ------------------------------ history read ------------------------------ */

let seq = 0;
function row(p: Partial<AdHistory> & { campaign_name: string }): AdHistory {
  seq++;
  return {
    id: `r${seq}`,
    business_id: "b1",
    platform: "meta",
    ad_name: null,
    copy: null,
    impressions: null,
    clicks: null,
    spend_cents: null,
    results: null,
    ctr: null,
    started_on: null,
    ended_on: null,
    source: "meta_export",
    created_at: "2026-09-12T00:00:00Z",
    ...p,
  };
}

// Account: 32,100 impressions, 560 clicks, $745 spend.
const A = row({ campaign_name: "Fall Promo", ad_name: "Pumpkin latte", copy: "$2 off pumpkin lattes this week", impressions: 10000, clicks: 300, spend_cents: 30000, started_on: "2026-08-01", ended_on: "2026-08-31" });
const B = row({ campaign_name: "Fall Promo", ad_name: "Pumpkin bread", copy: "20% off pumpkin bread", impressions: 5000, clicks: 100, spend_cents: 10000, started_on: "2026-09-01" });
const C = row({ campaign_name: "Brand", copy: "Rated the best coffee in Asheville by 500 neighbors", impressions: 10000, clicks: 100, spend_cents: 20000, ended_on: "2026-07-31" });
const D = row({ campaign_name: "Cold brew", ad_name: "Cold brew launch", impressions: 5000, clicks: 40, spend_cents: 10000 });
const E = row({ campaign_name: "Cookies", copy: "Free cookie with any drink", impressions: 100, clicks: 10, spend_cents: 500 });
const F = row({ campaign_name: "Grinders", copy: "How to pick a coffee grinder", impressions: 2000, clicks: 10, spend_cents: 4000 });
const ROWS = [A, B, C, D, E, F];
const ACCOUNT = 560 / 32100;

describe("readAdHistory", () => {
  const read = readAdHistory(ROWS);

  it("weights the account CTR by impressions", () => {
    expect(read.ads).toBe(6);
    expect(read.accountCtr).toBeCloseTo(ACCOUNT, 9);
    expect(read.spendCents).toBe(74500);
    expect(read.accountCpcCents).toBe(133);
    expect(read.lastRanOn).toBe("2026-09-01");
  });

  it("ranks best and worst above the impression floor, never overlapping", () => {
    // E has a 10% CTR on 100 impressions: noise, not a winner.
    expect(read.best.map((r) => r.id)).toEqual([A.id, B.id, C.id]);
    expect(read.worst.map((r) => r.id)).toEqual([F.id, D.id]);
  });

  it("groups by theme from copy, then ad name, then campaign", () => {
    const offer = read.byTheme.find((t) => t.theme === "offer")!;
    expect(offer.ads).toBe(3);
    expect(offer.ctr).toBeCloseTo(410 / 15100, 9);
    expect(offer.vsAccount).toBeCloseTo(410 / 15100 / ACCOUNT, 9);
    expect(read.byTheme.find((t) => t.theme === "novelty")?.ads).toBe(1);
    expect(read.byTheme.find((t) => t.theme === "education")?.ads).toBe(1);
  });

  it("is empty-safe", () => {
    expect(readAdHistory([])).toEqual({
      ads: 0,
      accountCtr: null,
      accountCpcCents: null,
      spendCents: 0,
      best: [],
      worst: [],
      byTheme: [],
      lastRanOn: null,
    });
  });
});

describe("historyOnTerm", () => {
  it("lifts a term whose past ads beat the account", () => {
    const h = historyOnTerm(ROWS, "pumpkin spice latte");
    const ratio = 400 / 15000 / ACCOUNT;
    expect(h.ads).toBe(2);
    expect(h.ctr).toBeCloseTo(400 / 15000, 9);
    expect(h.lift).toBeCloseTo(0.5 + (ratio - 1) * 0.5, 9);
    expect(h.reason).toBe("your 2 past ads on this ran 53% above your account average");
    expect(h.reason).not.toMatch(/[—→]/);
  });

  it("lowers a term whose past ad lagged, singular wording", () => {
    const h = historyOnTerm(ROWS, "coffee grinders");
    // Matches C (coffee) and F (coffee, grinder).
    expect(h.ads).toBe(2);
    expect(h.lift).toBeLessThan(0.5);
    expect(h.reason).toMatch(/^your 2 past ads on this ran \d+% below your account average$/);
    const one = historyOnTerm(ROWS, "cold brew");
    expect(one.reason).toMatch(/^your past ad on this ran \d+% below your account average$/);
  });

  it("stays neutral with no match or too little delivery", () => {
    expect(historyOnTerm(ROWS, "oat milk")).toEqual({
      lift: 0.5,
      ads: 0,
      ctr: null,
      reason: "you haven't run ads on this before",
    });
    const thin = historyOnTerm(ROWS, "cookie");
    expect(thin.ads).toBe(1);
    expect(thin.lift).toBe(0.5);
  });

  it("clamps lift to 0..1", () => {
    const rows = [
      row({ campaign_name: "Tacos", impressions: 2000, clicks: 400 }),
      row({ campaign_name: "Other", impressions: 100000, clicks: 100 }),
    ];
    expect(historyOnTerm(rows, "tacos").lift).toBe(1);
  });
});

describe("historyByTheme and bestTheme", () => {
  it("reads a theme against the account", () => {
    const h = historyByTheme(ROWS, "offer");
    expect(h.ads).toBe(3);
    expect(h.reason).toBe("your 3 past ads built on a deal or a price ran 56% above your account average");
    expect(historyByTheme(ROWS, "speed").ads).toBe(0);
  });

  it("picks the theme with the best ratio given 2 ads and 1000 impressions", () => {
    const best = bestTheme(ROWS);
    expect(best?.theme).toBe("offer");
    expect(best?.ads).toBe(3);
    expect(best?.vsAccount).toBeCloseTo(410 / 15100 / ACCOUNT, 9);
  });

  it("returns null when no theme has enough behind it", () => {
    expect(bestTheme([A, C])).toBeNull();
    expect(bestTheme([])).toBeNull();
  });
});
