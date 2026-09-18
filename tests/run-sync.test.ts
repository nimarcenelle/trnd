import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { AdHistory, NewBusiness, NewPickBundle } from "../lib/db/types";
import { historyRowsForRun, resultsFromRows, syncRunsFromHistory } from "../lib/ads/run-sync";
import { runTrackingName, withSyncedNumbers } from "../lib/picks/list";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-run-sync-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

/**
 * The brand's own ad history, written onto the creative tests it belongs to
 * by name: the brief says what to call the ad, and every history row that
 * carries the name, synced from the account or uploaded as an export, is
 * summed onto the run. Live on first delivery, never closed by the sync,
 * never a verdict.
 */

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "eskiin",
  category: "Beauty & wellness",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: "https://eskiin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  market: "online",
  monthly_ad_spend: "50-100k",
  ad_platforms: ["meta"],
});

const bundle = (): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank: 1,
    geo: "US",
    term: "hard water",
    finding: 'Your customers are searching "hard water."',
    metric_label: 'Searches for "hard water"',
    metric_value: 1000,
    metric_delta_pct: 20,
    metric_window: "week",
    sparkline: [],
    bet_what: "The crust on the showerhead: 20-second talking head",
    bet_budget_usd: 2500,
    bet_duration_days: 5,
    bet_kill_rule: "Cost per purchase against your account's",
    guardrail: null,
    concept_title: "The crust on the showerhead",
    status: "ready",
  },
  evidence: [],
  scripts: ["A", "B", "C"].map((label) => ({
    variant_label: label,
    thesis: "Problem first",
    hook: `Hook ${label}`,
    beats: [],
    direction: {
      show: "A real bathroom, the old showerhead still on the wall, then the filter going on by hand in one shot.",
      say: "Name the problem the way the customer does, then say plainly what the filter changes about the water.",
      prove: "What the filter removes, as the product page states it. No results promised.",
    },
    cta: "Shop the filter",
    duration_seconds: 20,
  })),
});

let n = 0;
const row = (over: Partial<AdHistory>): AdHistory =>
  ({
    id: `h${++n}`,
    business_id: "b",
    platform: "meta",
    campaign_name: "Prospecting",
    ad_name: null,
    copy: null,
    impressions: null,
    clicks: null,
    spend_cents: null,
    results: null,
    ctr: null,
    started_on: null,
    ended_on: null,
    source: "meta_api",
    created_at: "",
    ...over,
  }) as AdHistory;

describe("the tracking name", () => {
  it("is the concept's title, the research term on an older pick, and never runs long", () => {
    expect(runTrackingName({ term: "hard water", concept_title: "The crust on the showerhead" })).toBe("TRND: The crust on the showerhead");
    expect(runTrackingName({ term: "hard water", concept_title: null })).toBe("TRND: hard water");
    expect(runTrackingName({ term: "x".repeat(200) }).length).toBe(86);
  });

  it("finds the rows that carry it in the ad or the campaign name, whatever the case and spacing", () => {
    const pick = { term: "hard water", concept_title: "The crust on the showerhead" };
    const rows = [
      row({ ad_name: "trnd:  the crust on the showerhead / v1", impressions: 100 }),
      row({ campaign_name: "Q3 tests · TRND: The crust on the showerhead", impressions: 200 }),
      row({ campaign_name: "TRND pick: hard water", impressions: 300, source: "manual" }),
      row({ ad_name: "Founder story", impressions: 400 }),
      row({ ad_name: "TRND: The towel that slips", impressions: 500 }),
    ];
    expect(historyRowsForRun(rows, pick).map((r) => r.impressions)).toEqual([100, 200, 300]);
  });

  it("sums the matched rows into the run's numbers and leaves revenue to the owner", () => {
    expect(
      resultsFromRows([
        row({ impressions: 9000, clicks: 180, spend_cents: 40012, results: 6 }),
        row({ impressions: 1000, clicks: 20, spend_cents: null, results: 2 }),
      ]),
    ).toEqual({ spend_usd: 400.12, impressions: 10000, clicks: 200, conversions: 8, revenue_usd: null });
    expect(resultsFromRows([])).toEqual({ spend_usd: null, impressions: null, clicks: null, conversions: null, revenue_usd: null });
  });
});

describe("withSyncedNumbers", () => {
  it("keeps a synced figure where the form was blank and takes the owner's where it was not", () => {
    const form = { spend_usd: null, impressions: null, clicks: 200, conversions: null, revenue_usd: 1200 };
    const run = { spend_usd: "400.12" as unknown as number, impressions: 9000, clicks: 180, conversions: 6, revenue_usd: null };
    expect(withSyncedNumbers(form, run)).toEqual({ spend_usd: 400.12, impressions: 9000, clicks: 200, conversions: 6, revenue_usd: 1200 });
  });
});

describe("syncing runs from the brand's ad history", () => {
  beforeEach(() => resetStore());

  async function setup(status: "planned" | "running") {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [pickId] = await repo.replaceWeekPicks(biz.id, "2026-09-14", [bundle()]);
    const run = await repo.createPickRun({ pick_id: pickId, business_id: biz.id, status });
    return { repo, biz, pickId, run };
  }

  it("marks a chosen test launched on the day its ad started and fills its numbers, without closing it", async () => {
    const { repo, biz, run } = await setup("planned");
    await repo.upsertAdHistory([
      { ...row({ ad_name: "TRND: The crust on the showerhead", impressions: 9000, clicks: 180, spend_cents: 40012, results: 6, started_on: "2026-09-16" }), business_id: biz.id },
      { ...row({ ad_name: "Founder story", impressions: 50000, clicks: 500, started_on: "2026-06-01" }), business_id: biz.id },
    ]);
    const out = await syncRunsFromHistory(repo, biz.id, new Date("2026-09-18T08:00:00Z"));
    expect(out).toEqual([{ runId: run.id, status: "running", matched: 1 }]);
    const [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ status: "running", launched_at: "2026-09-16T12:00:00.000Z", impressions: 9000, clicks: 180, spend_usd: 400.12, conversions: 6, revenue_usd: null });
    expect(saved.ended_at).toBeNull();
  });

  it("refreshes a launched test's numbers on every pass, keeps the owner's revenue, and leaves the rest alone", async () => {
    const { repo, biz, run } = await setup("running");
    await repo.updatePickRun(run.id, { revenue_usd: 960 });
    await repo.upsertAdHistory([{ ...row({ ad_name: "TRND: The crust on the showerhead", impressions: 2000, clicks: 40, started_on: "2026-09-16" }), business_id: biz.id }]);
    expect(await syncRunsFromHistory(repo, biz.id)).toHaveLength(1);
    let [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ status: "running", impressions: 2000, clicks: 40, revenue_usd: 960 });

    // Tomorrow's sync replaces the account's rows with bigger numbers.
    await repo.deleteAdHistory(biz.id, { source: "meta_api" });
    await repo.upsertAdHistory([{ ...row({ ad_name: "TRND: The crust on the showerhead", impressions: 9000, clicks: 180, started_on: "2026-09-16" }), business_id: biz.id }]);
    await syncRunsFromHistory(repo, biz.id);
    [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ impressions: 9000, clicks: 180, revenue_usd: 960 });

    await repo.updatePickRun(run.id, { status: "killed", ended_at: new Date().toISOString() });
    expect(await syncRunsFromHistory(repo, biz.id)).toEqual([]);
  });

  it("does nothing for a test nothing was named for, or a brand with no history", async () => {
    const { repo, biz } = await setup("planned");
    expect(await syncRunsFromHistory(repo, biz.id)).toEqual([]);
    await repo.upsertAdHistory([{ ...row({ ad_name: "Founder story", impressions: 500 }), business_id: biz.id }]);
    expect(await syncRunsFromHistory(repo, biz.id)).toEqual([]);
    const [{ run }] = await repo.listPickRuns(biz.id);
    expect(run.status).toBe("planned");
  });
});
