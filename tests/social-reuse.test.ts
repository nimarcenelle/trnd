import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-social-"));
delete process.env.APIFY_TOKEN;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { ingestSocialAccounts } = await import("../lib/intel/social-ingest");

const input = (owner: string, handles: Record<string, string>): NewBusiness => ({
  owner_id: owner,
  name: "Eskiin",
  category: "filtered showerhead brand",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 0,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: handles,
  market: "online",
  monthly_ad_spend: "20-50k",
  ad_platforms: ["meta"],
});

describe("reusing a recent read of the same account", () => {
  beforeEach(() => resetStore());

  it("copies another workspace's week-old read of the same handle instead of scraping, even with no reader", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const first = await createDemoRepo({ kind: "user", userId: "a" }).createBusiness(input("a", { instagram: "myeskiin" }));
    await admin.upsertSocialPosts([
      { business_id: first.id, competitor_id: null, platform: "instagram", external_id: "p1", url: "https://instagram.com/p/p1", caption: "hard water fix", media_type: "image", posted_at: new Date().toISOString(), likes: 300, comments: 12, shares: 0, views: 0, is_ad: false, kind: null },
      { business_id: first.id, competitor_id: null, platform: "instagram", external_id: "p2", url: "https://instagram.com/p/p2", caption: "studio day", media_type: "image", posted_at: new Date().toISOString(), likes: 120, comments: 4, shares: 0, views: 0, is_ad: false, kind: null },
    ]);
    const second = await createDemoRepo({ kind: "user", userId: "b" }).createBusiness(input("b", { instagram: "MyEskiin" }));

    const summary = await ingestSocialAccounts(admin, second, []);
    expect(summary.ownPosts).toBe(2);
    const mine = await admin.listSocialPosts(second.id, { competitorId: null, platform: "instagram", sinceDays: 120 });
    expect(mine.map((p) => p.external_id).sort()).toEqual(["p1", "p2"]);
    expect(mine.every((p) => p.business_id === second.id)).toBe(true);
  });

  it("reads nothing when no workspace has the handle and no reader is configured", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const only = await createDemoRepo({ kind: "user", userId: "c" }).createBusiness(input("c", { tiktok: "nobodyhere" }));
    expect((await ingestSocialAccounts(admin, only, [])).ownPosts).toBe(0);
  });
});
