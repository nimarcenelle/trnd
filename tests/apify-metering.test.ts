import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NewProviderUsage } from "../lib/db/types";
import { env } from "../lib/env";
import { createTiktokApifyAdapter, fieldCoverage } from "../lib/signals/adapters/tiktok-apify";
import { fetchAdvertiserAds } from "../lib/signals/adlibrary-apify";
import { fetchGoogleAds } from "../lib/signals/google-ads-transparency";
import { setProviderUsageSink } from "../lib/usage/providers";

/**
 * The three Apify paths that used to bill without a row in provider_usage:
 * per-term TikTok, the rival Ad Library read by Page, and the Google
 * Transparency read. Each now goes through the shared metered call, so the
 * cost per brand the app shows is the cost the provider bills.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000).toISOString();

describe("metering the unmetered Apify paths", () => {
  const rows: NewProviderUsage[] = [];
  const token = env.apifyToken;
  beforeEach(() => {
    env.apifyToken = "tok";
    setProviderUsageSink(async (r) => {
      rows.push(r);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    rows.length = 0;
    env.apifyToken = token;
    setProviderUsageSink(null);
    vi.restoreAllMocks();
  });

  it("meters every per-term TikTok run by the results it returned", async () => {
    const items = [
      { id: "1", text: "cold plunge", createTimeISO: at(2), playCount: 100, videoMeta: { duration: 20 } },
      { id: "2", text: "plunge tub", createTimeISO: at(4), playCount: 50, videoMeta: { duration: 15 } },
    ];
    const fetchText = vi.fn(async (url: string) => {
      expect(url).toContain("/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=tok");
      return JSON.stringify(items);
    });
    const adapter = createTiktokApifyAdapter({ fetchText: fetchText as never });
    const out = await adapter.fetch({
      terms: [],
      watch: [
        { term: "cold plunge", category: "Health & beauty", geo: "US-NY" },
        { term: "sauna", category: "Health & beauty", geo: "US-NY" },
      ],
      geo: "US",
      windowDays: 7,
    });
    await flush();
    expect(out).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider: "apify", operation: "clockworks~tiktok-scraper", units: 2, unit_label: "results", ok: true });
    expect(rows[0].est_cost_cents).toBe(0.8);
  });

  it("meters the rival Ad Library read, and a non-JSON answer is a failure, not an empty advertiser", async () => {
    const ads = [{ ad_archive_id: "9", page_name: "Dae Hair", snapshot: { body: { text: "Back in stock" } }, start_date: 1_757_000_000 }];
    expect(await fetchAdvertiserAds("Dae Hair", { fetchText: async () => JSON.stringify(ads) })).toHaveLength(1);
    await expect(fetchAdvertiserAds("Dae Hair", { fetchText: async () => "<html>Cloudflare</html>" })).rejects.toThrow(/not JSON/);
    await flush();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ operation: "curious_coder/facebook-ads-library-scraper", units: 1, unit_label: "results", ok: true });
    expect(rows[1]).toMatchObject({ units: 1, unit_label: "runs", ok: false, note: "answer was not JSON" });
  });

  it("meters the Google Transparency read at the actor's own rate", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ creativeId: `c${i}`, adFormat: "TEXT", firstShown: "2026-08-01", lastShown: "2026-09-10" }));
    expect(await fetchGoogleAds("daehair.com", { fetchText: async () => JSON.stringify(items) })).toHaveLength(10);
    await flush();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operation: "solidcode/ads-transparency-scraper", units: 10, unit_label: "results" });
    expect(rows[0].est_cost_cents).toBe(1.5);
  });

  it("records a failed run as a failed run and lets the caller decide", async () => {
    await expect(
      fetchAdvertiserAds("Dae Hair", {
        fetchText: async () => {
          throw new Error("HTTP 402 https://api.apify.com/x?token=secret");
        },
      }),
    ).rejects.toThrow(/402/);
    await flush();
    expect(rows[0]).toMatchObject({ ok: false, unit_label: "runs" });
    expect(rows[0].note).not.toMatch(/secret/);
  });
});

describe("field coverage on a live TikTok payload", () => {
  it("says which documented fields arrived, which never did, and what else the items carry", () => {
    const c = fieldCoverage([
      { id: "1", text: "a", createTimeISO: at(1), playCount: 5, diggCount: 1, videoMeta: { duration: 9 }, authorMeta: { name: "x", fans: 10 }, hashtags: [], stats: { plays: 5 } },
      { id: "2", text: "b", createTimeISO: at(2), playCount: 0, stats: { plays: 0 } },
    ]);
    expect(c.items).toBe(2);
    expect(c.present.playCount).toBe(2);
    expect(c.present["videoMeta.duration"]).toBe(1);
    expect(c.missing).toEqual(["commentCount", "shareCount", "collectCount", "webVideoUrl"]);
    expect(c.unexpected).toEqual(["stats"]);
    expect(c.ok).toBe(true);
  });

  it("fails the run when a required field is missing on every item", () => {
    const c = fieldCoverage([{ id: "1", stats: { playCount: 5 }, createTime: 1_757_000_000 }]);
    expect(c.ok).toBe(false);
    expect(c.missing).toContain("createTimeISO");
    expect(c.missing).toContain("playCount");
    expect(fieldCoverage([]).ok).toBe(true);
  });
});
