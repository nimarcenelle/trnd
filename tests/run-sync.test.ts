import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { BrandPick, Campaign, NewBusiness, NewPickBundle, PickRun } from "../lib/db/types";
import { matchRun, resultsFromInsights, syncPickRunFromCampaign } from "../lib/ads/run-sync";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-run-sync-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

/**
 * The connected account's numbers land on the creative test they belong
 * to: the run goes live when the platform delivers, closes when the
 * platform says the campaign ended, and on closing becomes the brand's own
 * ad-history row with its lift over the account logged. Never a verdict,
 * never a stopped run, never a reopened one.
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

const bundle = (opportunityId: string | null = null): NewPickBundle => ({
  pick: {
    opportunity_id: opportunityId,
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

const campaignOf = (businessId: string, over: Partial<Campaign> = {}): Campaign => ({
  id: "camp-1",
  opportunity_id: "opp-1",
  business_id: businessId,
  angle: "Problem first",
  hook: "Your shower is why your hair feels like straw",
  offer: "Shop the filter",
  audience: { who: "women 25 to 40", age_range: "25-40", radius_miles: 0, interests: [], why: "" },
  channel: "meta",
  status: "live",
  external_id: "120000000001",
  external_status: "ACTIVE",
  model_used: "test",
  prompt_version: "1",
  created_at: "2026-09-14T09:00:00Z",
  ...over,
});

const insights = (over: Partial<ReturnType<typeof resultsFromInsights>> & { spend_cents?: number | null; revenue_cents?: number | null; bookings?: number | null } = {}) => ({
  impressions: over.impressions ?? 9000,
  clicks: over.clicks ?? 180,
  spend_cents: over.spend_cents ?? 40012,
  bookings: over.bookings ?? 6,
  revenue_cents: over.revenue_cents ?? 96000,
});

describe("resultsFromInsights", () => {
  it("turns Graph cents into the run's dollars and keeps nulls null", () => {
    expect(resultsFromInsights(insights())).toEqual({ spend_usd: 400.12, impressions: 9000, clicks: 180, conversions: 6, revenue_usd: 960 });
    expect(resultsFromInsights({ impressions: null, clicks: null, spend_cents: null, bookings: null, revenue_cents: null })).toEqual({
      spend_usd: null,
      impressions: null,
      clicks: null,
      conversions: null,
      revenue_usd: null,
    });
  });
});

describe("matchRun", () => {
  const pick = (id: string, opportunity_id: string | null): BrandPick => ({ id, opportunity_id, term: "x" }) as unknown as BrandPick;
  const run = (id: string, over: Partial<PickRun>): PickRun =>
    ({ id, status: "running", meta_campaign_id: null, started_at: "2026-09-14T00:00:00Z", ...over }) as PickRun;

  it("prefers the platform id, then the opportunity, and never a stopped run", () => {
    const runs = [
      { run: run("killed", { status: "killed", meta_campaign_id: "1" }), pick: pick("p1", "opp-1") },
      { run: run("byOpp", {}), pick: pick("p2", "opp-1") },
      { run: run("byId", { meta_campaign_id: "1" }), pick: pick("p3", "opp-9") },
    ];
    expect(matchRun(runs, { external_id: "1", opportunity_id: "opp-1" })?.run.id).toBe("byId");
    expect(matchRun(runs, { external_id: "2", opportunity_id: "opp-1" })?.run.id).toBe("byOpp");
    expect(matchRun(runs, { external_id: "2", opportunity_id: "opp-none" })).toBeNull();
  });

  it("still matches an ended run by platform id, so late purchases land, but not by opportunity", () => {
    const runs = [{ run: run("done", { status: "completed", meta_campaign_id: "1" }), pick: pick("p1", "opp-1") }];
    expect(matchRun(runs, { external_id: "1", opportunity_id: "opp-1" })?.run.id).toBe("done");
    expect(matchRun(runs, { external_id: null, opportunity_id: "opp-1" })).toBeNull();
  });
});

describe("syncing a campaign's numbers onto its run", () => {
  beforeEach(() => resetStore());

  async function setup(opportunityId: string | null, runInput: { status: "planned" | "running"; meta_campaign_id?: string | null }) {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [pickId] = await repo.replaceWeekPicks(biz.id, "2026-09-14", [bundle(opportunityId)]);
    const run = await repo.createPickRun({ pick_id: pickId, business_id: biz.id, status: runInput.status, meta_campaign_id: runInput.meta_campaign_id ?? null });
    return { repo, biz, pickId, run };
  }

  it("marks a chosen test launched when the platform delivers, and fills its numbers without closing it", async () => {
    const { repo, biz, run } = await setup("opp-1", { status: "planned" });
    const now = new Date("2026-09-16T08:00:00Z");
    const out = await syncPickRunFromCampaign(repo, campaignOf(biz.id), { row: insights(), status: "ACTIVE" }, now);
    expect(out).toEqual({ runId: run.id, status: "running", closed: false });
    const [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ status: "running", launched_at: now.toISOString(), impressions: 9000, clicks: 180, spend_usd: 400.12, conversions: 6, revenue_usd: 960, meta_campaign_id: "120000000001" });
    expect(saved.ended_at).toBeNull();
    expect(saved.lift ?? null).toBeNull();
    // The history row waits for the end: the table is write-once per ad.
    expect(await repo.listAdHistory(biz.id)).toEqual([]);
  });

  it("closes the run when the platform says the campaign ended, logs its lift against the account, and lands it in ad history as the sync's own row", async () => {
    const { repo, biz, pickId, run } = await setup(null, { status: "running", meta_campaign_id: "120000000001" });
    // The account's record before this test: an export with a 1% click-through.
    await repo.upsertAdHistory([
      { business_id: biz.id, platform: "meta", campaign_name: "Prospecting", ad_name: "Old UGC", copy: null, impressions: 100000, clicks: 1000, spend_cents: null, results: null, ctr: null, started_on: "2026-06-01", ended_on: null, source: "meta_export" },
    ]);
    const now = new Date("2026-09-20T08:00:00Z");
    const out = await syncPickRunFromCampaign(repo, campaignOf(biz.id, { opportunity_id: "opp-other" }), { row: insights(), status: "COMPLETED" }, now);
    expect(out).toEqual({ runId: run.id, status: "completed", closed: true });

    const [{ run: saved }] = await repo.listPickRuns(biz.id);
    expect(saved).toMatchObject({ status: "completed", ended_at: now.toISOString(), impressions: 9000, clicks: 180, baseline_ctr: 0.01, lift: 2 });
    expect(saved.verdict ?? null).toBeNull();

    const history = await repo.listAdHistory(biz.id);
    const own = history.find((r) => r.campaign_name === "TRND pick: hard water");
    expect(own).toMatchObject({ source: "meta_api", ad_name: "A", impressions: 9000, clicks: 180, spend_cents: 40012, results: 6, ended_on: "2026-09-20" });
    expect(own?.started_on).toBe(run.started_at.slice(0, 10));
    expect((await repo.getPickDetail(pickId))?.run?.status).toBe("completed");
  });

  it("leaves a paused campaign's run open, and a stopped run alone", async () => {
    const { repo, biz } = await setup("opp-1", { status: "running" });
    const paused = await syncPickRunFromCampaign(repo, campaignOf(biz.id), { row: insights(), status: "PAUSED" });
    expect(paused?.status).toBe("running");
    const [{ run }] = await repo.listPickRuns(biz.id);
    await repo.updatePickRun(run.id, { status: "killed", ended_at: new Date().toISOString() });
    expect(await syncPickRunFromCampaign(repo, campaignOf(biz.id), { row: insights(), status: "COMPLETED" })).toBeNull();
    const [{ run: after }] = await repo.listPickRuns(biz.id);
    expect(after.status).toBe("killed");
  });

  it("does nothing for a campaign no test was chosen for", async () => {
    const { repo, biz } = await setup("opp-1", { status: "planned" });
    expect(await syncPickRunFromCampaign(repo, campaignOf(biz.id, { opportunity_id: "opp-9", external_id: "x" }), { row: insights(), status: "ACTIVE" })).toBeNull();
    const [{ run }] = await repo.listPickRuns(biz.id);
    expect(run.status).toBe("planned");
  });
});
