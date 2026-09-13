import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-signals-by-ids-"));

import { createDemoRepo } from "../lib/db/demo/repo";
import { resetStore } from "../lib/db/demo/store";
import { MAX_AD_HISTORY_READ } from "../lib/db/repo";
import type { NewSignal } from "../lib/db/types";

const signal = (term: string, geo = "US"): NewSignal => ({
  source: "google_trends",
  term,
  normalized_term: term.toLowerCase().replace(/\s+/g, "_"),
  category: "Health & beauty",
  geo,
  metric_type: "search_interest",
  value: 50,
  delta_pct: 10,
  window_days: 7,
  raw: null,
});

describe("demo repo getSignalsByIds", () => {
  beforeEach(() => resetStore());

  it("returns exactly the rows asked for, once each, skipping unknown ids", async () => {
    const repo = createDemoRepo({ kind: "admin" });
    await repo.upsertSignals([signal("Lip flip"), signal("Brow lamination"), signal("Skin cycling")]);
    const pool = await repo.listSignalsForCategory("Health & beauty");
    expect(pool).toHaveLength(3);
    const [a, b] = pool;

    const rows = await repo.getSignalsByIds([a.id, b.id, a.id, "not-a-signal"]);
    expect(rows.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    // The rows are the same rows getSignal would hand back one at a time.
    for (const row of rows) expect(row).toEqual(await repo.getSignal(row.id));
  });

  it("is empty for no ids", async () => {
    const repo = createDemoRepo({ kind: "admin" });
    await repo.upsertSignals([signal("Lip flip")]);
    expect(await repo.getSignalsByIds([])).toEqual([]);
  });
});

describe("demo repo listAdHistory", () => {
  beforeEach(() => resetStore());

  it("caps at the read limit, newest first", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "user-owner" });
    const biz = await repo.createBusiness({
      owner_id: "user-owner",
      name: "Glow Studio",
      category: "Health & beauty",
      city: "Atlanta",
      region: "GA",
      country: "US",
      lat: null,
      lng: null,
      radius_miles: 20,
      website: null,
      price_band: "$$",
      brand_voice_notes: null,
      photo_urls: [],
      social_handles: {},
      market: "local",
      monthly_ad_spend: null,
      ad_platforms: [],
    });
    const total = MAX_AD_HISTORY_READ + 25;
    const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86400_000).toISOString().slice(0, 10);
    await repo.upsertAdHistory(
      Array.from({ length: total }, (_, i) => ({
        business_id: biz.id,
        platform: "meta" as const,
        campaign_name: `Campaign ${i}`,
        ad_name: `Ad ${i}`,
        copy: null,
        impressions: 1000,
        clicks: 10,
        spend_cents: 1000,
        results: null,
        ctr: 0.01,
        started_on: day(i),
        ended_on: null,
        source: "meta_export" as const,
      })),
    );
    const rows = await repo.listAdHistory(biz.id);
    expect(rows).toHaveLength(MAX_AD_HISTORY_READ);
    expect(rows[0].started_on).toBe(day(total - 1));
  });
});
