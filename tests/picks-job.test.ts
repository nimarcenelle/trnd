import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Business, NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-picks-job-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { runPicksJob } = await import("../lib/picks/week-job");
const { weekOf } = await import("../lib/recommend/week");

const bizInput = (ownerId: string, name: string): NewBusiness => ({
  owner_id: ownerId,
  name,
  category: "Beauty & wellness",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  market: "online",
  monthly_ad_spend: "20-50k",
  ad_platforms: ["meta"],
});

async function seed(names: string[], ranked = true) {
  const admin = createDemoRepo({ kind: "admin" });
  const businesses: Business[] = [];
  for (const [i, name] of names.entries()) {
    const owner = createDemoRepo({ kind: "user", userId: `owner-${i}` });
    const biz = await owner.createBusiness(bizInput(`owner-${i}`, name));
    businesses.push(biz);
    if (ranked) {
      await admin.upsertOpportunities([
        { business_id: biz.id, signal_id: `sig-${i}`, week_of: weekOf(), score: 7, rationale: "r", matched_service_id: null, competitor_gap: null, relevance: null },
      ]);
    }
  }
  return { admin, businesses };
}

/** Writes a one-draft week, the way a week that failed validation lands. */
const draftWeek = (calls: string[]) => async (repo: ReturnType<typeof createDemoRepo>, business: Business) => {
  calls.push(business.name);
  await repo.replaceWeekPicks(business.id, weekOf(), [
    {
      pick: {
        opportunity_id: null, rank: 1, geo: "US", term: "hard water", finding: "f", metric_label: "m", metric_value: null,
        metric_delta_pct: null, metric_window: "30d", sparkline: [], bet_what: "b", bet_budget_usd: 1000, bet_duration_days: 5,
        bet_kill_rule: "k", guardrail: null, status: "draft",
      },
      evidence: [],
      scripts: [],
    },
  ]);
  return { ready: 0, draft: 1 };
};

describe("the weekly pick job", () => {
  beforeEach(() => resetStore());

  it("writes each ranked brand once, and a drafts-only week is not retried", async () => {
    const { admin } = await seed(["A", "B"]);
    const calls: string[] = [];
    const first = await runPicksJob(admin, { generate: draftWeek(calls) });
    expect(first.written).toHaveLength(2);
    const second = await runPicksJob(admin, { generate: draftWeek(calls) });
    expect(second.written).toHaveLength(0);
    expect(second.skipped).toBe(2);
    expect(calls).toEqual(["A", "B"]);
  });

  it("skips a brand with nothing ranked this week", async () => {
    const { admin } = await seed(["A"], false);
    const result = await runPicksJob(admin, { generate: draftWeek([]) });
    expect(result).toEqual({ written: [], skipped: 1, remaining: 0 });
  });

  it("stops starting brands when the budget is spent and reports what is left", async () => {
    const { admin } = await seed(["A", "B", "C"]);
    let clock = 0;
    const calls: string[] = [];
    const slow = async (repo: ReturnType<typeof createDemoRepo>, business: Business) => {
      clock += 100_000; // each brand takes 100 seconds
      return draftWeek(calls)(repo, business);
    };
    const hop1 = await runPicksJob(admin, { budgetMs: 120_000, now: () => clock, generate: slow });
    expect(hop1.written.map((w) => w.businessId).length).toBe(2);
    expect(hop1.remaining).toBe(1);
    clock = 0;
    const hop2 = await runPicksJob(admin, { budgetMs: 120_000, now: () => clock, generate: slow });
    expect(hop2.written).toHaveLength(1);
    expect(hop2.remaining).toBe(0);
    expect(calls).toEqual(["A", "B", "C"]);
  });
});
