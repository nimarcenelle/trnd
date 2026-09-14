import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-adsdocs-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { importAdExportsFromDocuments } = await import("../lib/ads/from-documents");

const META_CSV = `Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Impressions,Link clicks,Amount spent (USD),Results,CTR (all),Body
2026-08-01,2026-08-15,Fall Promo,Locals 25-54,Pumpkin latte,"12,000",240,"$1,234.56",18,2.10%,$2 off pumpkin lattes
2026-08-01,2026-08-31,Brand,Everyone,Rated best coffee,5000,50,80.5,,1.00%,
`;

describe("ad exports among the onboarding uploads", () => {
  beforeEach(() => resetStore());

  it("reads an Ads Manager export as the brand's ad history and leaves a menu alone", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness({
      owner_id: "owner", name: "Rinse", category: "shower filter brand", city: "", region: null, country: "US", lat: null, lng: null, radius_miles: 0,
      website: null, price_band: null, brand_voice_notes: null, photo_urls: [], social_handles: {}, market: "online", monthly_ad_spend: null, ad_platforms: ["meta"],
    });
    const written = await importAdExportsFromDocuments(admin, biz.id, [
      { name: "menu.csv", mime: "text/csv", text: "Item,Qty,Price\nLatte,3,4.50\n" },
      { name: "ads.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", text: META_CSV },
      { name: "menu.pdf", mime: "application/pdf", text: "Brunch menu" },
    ]);
    expect(written).toBe(2);
    const rows = await admin.listAdHistory(biz.id);
    expect(rows.map((r) => r.campaign_name).sort()).toEqual(["Brand", "Fall Promo"]);
    expect(rows[0].source).toBe("meta_export");
  });
});
