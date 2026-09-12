import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaAdCopy, MetaAdInsight } from "../lib/ads/meta";
import type { Business, NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-meta-history-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { fetchAdCreativeCopy, fetchAdLevelInsights, MAX_INSIGHT_PAGES } = await import("../lib/ads/meta");
const { syncMetaAdHistory, toAdHistoryRows } = await import("../lib/ads/history-sync");

afterEach(() => vi.unstubAllGlobals());

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Northfield Goods",
  category: "Apparel",
  city: "Austin",
  region: "TX",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 12,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
});

const INSIGHTS: MetaAdInsight[] = [
  {
    ad_id: "1",
    ad_name: "Restock UGC",
    adset_name: "Broad US",
    campaign_name: "Prospecting",
    impressions: "20000",
    clicks: "900",
    inline_link_clicks: "400",
    spend: "312.45",
    ctr: "4.5",
    actions: [
      { action_type: "omni_purchase", value: "12" },
      { action_type: "purchase", value: "12" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "12" },
      { action_type: "lead", value: "3" },
      { action_type: "link_click", value: "400" },
    ],
    date_start: "2026-03-16",
    date_stop: "2026-09-12",
  },
  {
    ad_id: "2",
    ad_name: "Founder story",
    campaign_name: "Retargeting",
    impressions: "5000",
    ctr: "1.2",
    spend: "40",
    date_start: "2026-03-16",
    date_stop: "2026-09-12",
  },
  // Served nothing: never becomes a row.
  { ad_id: "3", ad_name: "Draft", campaign_name: "Prospecting", impressions: "0", spend: "0" },
];

const COPY: Record<string, MetaAdCopy> = {
  "1": { title: "Back in stock", body: "The jacket that sold out twice is back.", createdOn: "2026-07-01" },
  "2": { title: null, body: null, createdOn: "2025-11-02" },
};

describe("Meta insights into ad history rows", () => {
  it("sums outcomes once per family, stores cents, a CTR fraction and the copy", () => {
    const [restock, founder, ...rest] = toAdHistoryRows(INSIGHTS, COPY);
    expect(rest).toEqual([]);
    expect(restock).toMatchObject({
      platform: "meta",
      source: "meta_api",
      campaign_name: "Prospecting",
      ad_name: "Restock UGC",
      copy: "Back in stock The jacket that sold out twice is back.",
      impressions: 20000,
      clicks: 400,
      spend_cents: 31245,
      results: 15,
      started_on: "2026-07-01",
      ended_on: null,
    });
    expect(restock.ctr).toBeCloseTo(0.02);
    // No clicks column: Graph's percentage becomes a fraction. Created before
    // the window, so it starts on the window's first day.
    expect(founder).toMatchObject({ clicks: null, results: null, copy: null, started_on: "2026-03-16", spend_cents: 4000 });
    expect(founder.ctr).toBeCloseTo(0.012);
  });

  it("reads dynamic creative copy from asset_feed_spec", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        "1": {
          id: "1",
          created_time: "2026-08-01T10:00:00+0000",
          creative: {
            asset_feed_spec: {
              titles: [{ text: "Built for winter" }, { text: "Second title" }],
              bodies: [{ text: "Down that packs into its own pocket." }],
            },
          },
        },
        "2": { id: "2", creative: { object_story_spec: { link_data: { message: "Story body", name: "Story title" } } } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const copy = await fetchAdCreativeCopy("tok", ["1", "2", "1"]);
    expect(copy["1"]).toEqual({ title: "Built for winter", body: "Down that packs into its own pocket.", createdOn: "2026-08-01" });
    expect(copy["2"]).toEqual({ title: "Story title", body: "Story body", createdOn: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("ids=1%2C2");
  });
});

describe("paging the insights edge", () => {
  it("follows paging.next and stops at the page cap", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ ad_id: "x", impressions: "10" }], paging: { next: "https://graph.facebook.com/v21.0/next?after=abc" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rows = await fetchAdLevelInsights("tok", "act_1", { since: "2026-03-16", until: "2026-09-12" });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_INSIGHT_PAGES);
    expect(rows).toHaveLength(MAX_INSIGHT_PAGES);
    const first = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(first.pathname).toBe("/v21.0/act_1/insights");
    expect(first.searchParams.get("level")).toBe("ad");
    expect(first.searchParams.get("time_range")).toBe('{"since":"2026-03-16","until":"2026-09-12"}');
    expect(first.searchParams.get("fields")).toContain("inline_link_clicks");
  });

  it("stops when there is no next page and surfaces Graph errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ ad_id: "x" }] })));
    expect(await fetchAdLevelInsights("tok", "act_1", { since: "a", until: "b" })).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Invalid OAuth access token" } }, { status: 400 })));
    await expect(fetchAdLevelInsights("tok", "act_1", { since: "a", until: "b" })).rejects.toThrow(/Invalid OAuth/);
  });
});

describe("syncing a connected account's history", () => {
  beforeEach(() => resetStore());

  const now = new Date("2026-09-12T12:00:00Z");
  const fetchInsights = vi.fn(async () => INSIGHTS);
  const fetchCopy = vi.fn(async () => COPY);

  async function setup(connect = true) {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz: Business = await repo.createBusiness(bizInput("owner"));
    if (connect) {
      await repo.upsertConnection({
        business_id: biz.id,
        provider: "meta",
        status: "connected",
        account_id: "act_42",
        account_name: "Northfield",
        access_token: "tok",
        refresh_token: null,
        token_expires_at: null,
        scopes: ["ads_read"],
      });
    }
    return { repo, biz };
  }

  it("skips cleanly with no Meta connection", async () => {
    const { repo, biz } = await setup(false);
    const called = vi.fn(async () => INSIGHTS);
    expect(await syncMetaAdHistory(repo, biz, { fetchInsights: called, fetchCopy, now })).toEqual({ ads: 0, skipped: "no Meta connection" });
    expect(called).not.toHaveBeenCalled();
  });

  it("returns a skipped result instead of throwing when Graph fails", async () => {
    const { repo, biz } = await setup();
    const failing = vi.fn(async () => {
      throw new Error("meta graph /act_42/insights: (#200) Ad account owner has NOT grant ads_read");
    });
    const result = await syncMetaAdHistory(repo, biz, { fetchInsights: failing, fetchCopy, now });
    expect(result.ads).toBe(0);
    expect(result.skipped).toMatch(/ads_read/);
    expect(await repo.listAdHistory(biz.id)).toEqual([]);
  });

  it("asks for the last 180 days and replaces its own rows rather than duplicating them", async () => {
    const { repo, biz } = await setup();
    // An export the owner uploaded is theirs; the sync never touches it.
    await repo.upsertAdHistory([
      { ...toAdHistoryRows(INSIGHTS, {})[0], business_id: biz.id, campaign_name: "Old export", source: "meta_export" },
    ]);

    expect(await syncMetaAdHistory(repo, biz, { fetchInsights, fetchCopy, now })).toEqual({ ads: 2 });
    expect(fetchInsights).toHaveBeenCalledWith("tok", "act_42", { since: "2026-03-16", until: "2026-09-12" });

    // Numbers moved overnight: the second pull overwrites, it does not add.
    const tomorrow = vi.fn(async () => INSIGHTS.map((r) => (r.ad_id === "1" ? { ...r, impressions: "25000" } : r)));
    expect(await syncMetaAdHistory(repo, biz, { fetchInsights: tomorrow, fetchCopy, now })).toEqual({ ads: 2 });

    const rows = await repo.listAdHistory(biz.id);
    expect(rows.filter((r) => r.source === "meta_api")).toHaveLength(2);
    expect(rows.find((r) => r.ad_name === "Restock UGC" && r.source === "meta_api")?.impressions).toBe(25000);
    expect(rows.filter((r) => r.source === "meta_export")).toHaveLength(1);
  });
});
