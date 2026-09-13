import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";
import { parseRunResults, runAdHistoryRow, runRates, runRatesLine, type RunResults } from "../lib/picks/list";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-run-results-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const empty: RunResults = { spend_usd: null, impressions: null, clicks: null, conversions: null, revenue_usd: null };

describe("parseRunResults", () => {
  it("takes nothing at all: every field is optional", () => {
    expect(parseRunResults(form({}))).toEqual({ ok: true, results: empty });
    expect(parseRunResults(form({ spend_usd: "  ", clicks: "" }))).toEqual({ ok: true, results: empty });
  });

  it("reads plain and formatted numbers", () => {
    expect(
      parseRunResults(
        form({ spend_usd: "$1,250.504", impressions: "12,000", clicks: "240", conversions: "8", revenue_usd: "3000" }),
      ),
    ).toEqual({ ok: true, results: { spend_usd: 1250.5, impressions: 12000, clicks: 240, conversions: 8, revenue_usd: 3000 } });
    expect(parseRunResults(form({ spend_usd: "0" }))).toEqual({ ok: true, results: { ...empty, spend_usd: 0 } });
  });

  it("rejects negatives, junk, fractional counts and more clicks than impressions", () => {
    expect(parseRunResults(form({ spend_usd: "-5" }))).toEqual({ ok: false, error: "Spend (USD) can't be negative." });
    expect(parseRunResults(form({ impressions: "lots" }))).toEqual({ ok: false, error: "Impressions has to be a number." });
    expect(parseRunResults(form({ revenue_usd: "1e5" }))).toMatchObject({ ok: false });
    expect(parseRunResults(form({ clicks: "2.5" }))).toEqual({ ok: false, error: "Clicks has to be a whole number." });
    expect(parseRunResults(form({ conversions: "Infinity" }))).toMatchObject({ ok: false });
    expect(parseRunResults(form({ impressions: "100", clicks: "101" }))).toEqual({
      ok: false,
      error: "Clicks can't be more than impressions.",
    });
    const fd = new FormData();
    fd.set("clicks", new File(["1"], "x.txt"));
    expect(parseRunResults(fd)).toMatchObject({ ok: false });
  });
});

describe("run rates", () => {
  it("computes CTR, CVR and ROAS only where the denominators exist", () => {
    expect(runRates({ impressions: 10000, clicks: 200, conversions: 10, spend_usd: 500, revenue_usd: 1200 })).toEqual({
      ctr: 0.02,
      cvr: 0.05,
      roas: 2.4,
    });
    expect(runRates({ impressions: 0, clicks: 0, conversions: 3, spend_usd: 0, revenue_usd: 10 })).toEqual({
      ctr: null,
      cvr: null,
      roas: null,
    });
    expect(runRatesLine({ impressions: 12000, clicks: 250, conversions: 8, spend_usd: 450, revenue_usd: 1100 })).toBe(
      "CTR 2.1% · CVR 3.2% · ROAS 2.4x",
    );
    expect(runRatesLine({ spend_usd: 450 })).toBeNull();
  });
});

const pickFields = { business_id: "b1", term: "hard water", bet_what: "The hard-water problem-first video on Reels" };
const scripts = [
  { position: 1, variant_label: "B", hook: "Second hook" },
  { position: 0, variant_label: "A", hook: "Your shower is why your hair feels like straw" },
];
const run = { started_at: "2026-09-14T09:30:00Z" };
const endedAt = new Date("2026-09-20T18:00:00Z");

describe("runAdHistoryRow", () => {
  it("writes nothing without delivery numbers", () => {
    expect(runAdHistoryRow({ pick: pickFields, scripts, run, results: { ...empty, spend_usd: 400, conversions: 3 }, endedAt })).toBeNull();
  });

  it("shapes one manual Meta row from the pick, its first script and the results", () => {
    const row = runAdHistoryRow({
      pick: pickFields,
      scripts,
      run,
      results: { spend_usd: 450.25, impressions: 12000, clicks: 240, conversions: 8, revenue_usd: 1100 },
      endedAt,
    });
    expect(row).toEqual({
      business_id: "b1",
      platform: "meta",
      campaign_name: "TRND pick: hard water",
      ad_name: "A",
      copy: "The hard-water problem-first video on Reels\nYour shower is why your hair feels like straw",
      impressions: 12000,
      clicks: 240,
      spend_cents: 45025,
      results: 8,
      ctr: 0.02,
      started_on: "2026-09-14",
      ended_on: "2026-09-20",
      source: "manual",
    });
  });

  it("falls back to the term for the ad name and leaves CTR null without impressions", () => {
    const row = runAdHistoryRow({ pick: pickFields, scripts: [], run, results: { ...empty, clicks: 30 }, endedAt });
    expect(row).toMatchObject({ ad_name: "hard water", copy: "The hard-water problem-first video on Reels", ctr: null, impressions: null, clicks: 30 });
  });
});

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
    bet_what: "Problem-first video on Reels",
    bet_budget_usd: 2500,
    bet_duration_days: 5,
    bet_kill_rule: "Kill if cost per purchase runs 30% over your account average by day 3",
    guardrail: null,
    status: "ready",
  },
  evidence: [],
  scripts: ["A", "B", "C"].map((label) => ({
    variant_label: label,
    thesis: "Problem first",
    hook: `Hook ${label}`,
    beats: [{ visual: "Crust on a showerhead", on_screen_text: "", vo: "" }],
    direction: {
      show: "A real bathroom, the old showerhead still on the wall, then the filter going on by hand in one shot.",
      say: "Name the problem the way the customer does, then say plainly what the filter changes about the water.",
      prove: "What the filter removes, as the product page states it. No results promised.",
    },
    cta: "Shop the filter",
    duration_seconds: 20,
  })),
});

describe("completing a run in the store", () => {
  beforeEach(() => resetStore());

  it("stores the results on the run and one row in the brand's ad history", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [pickId] = await repo.replaceWeekPicks(biz.id, "2026-09-14", [bundle()]);
    const started = await repo.createPickRun({ pick_id: pickId, business_id: biz.id, status: "running" });

    const parsed = parseRunResults(form({ spend_usd: "400", impressions: "9000", clicks: "180", conversions: "6", revenue_usd: "960" }));
    if (!parsed.ok) throw new Error(parsed.error);
    const { results } = parsed;
    await repo.updatePickRun(started.id, { status: "completed", ended_at: endedAt.toISOString(), ...results });

    const detail = await repo.getPickDetail(pickId);
    const row = runAdHistoryRow({ pick: detail!.pick, scripts: detail!.scripts, run: started, results, endedAt });
    expect(await repo.upsertAdHistory([row!])).toBe(1);
    // A second submit of the same run is the same row.
    expect(await repo.upsertAdHistory([row!])).toBe(0);

    const [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ status: "completed", spend_usd: 400, impressions: 9000, clicks: 180, conversions: 6, revenue_usd: 960 });
    expect(runRatesLine(saved)).toBe("CTR 2% · CVR 3.3% · ROAS 2.4x");

    const history = await repo.listAdHistory(biz.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      business_id: biz.id,
      platform: "meta",
      campaign_name: "TRND pick: hard water",
      ad_name: "A",
      copy: "Problem-first video on Reels\nHook A",
      impressions: 9000,
      clicks: 180,
      spend_cents: 40000,
      results: 6,
      ctr: 0.02,
      ended_on: "2026-09-20",
      source: "manual",
    });
    expect(history[0].started_on).toBe(started.started_at.slice(0, 10));
  });
});
