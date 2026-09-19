import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-memory-"));
delete process.env.OPENAI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { recommendForBusiness, weekOf } = await import("../lib/recommend/recommend");

const smokehouse = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Hickory Pit",
  category: "Restaurants & cafés",
  city: "Durham",
  region: "NC",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 15,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: ["meta"],
});

const DAY = 86400_000;

async function seed() {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(smokehouse("owner"));
  await user.createServices(
    [
      ["Smoked brisket plate", 1800],
      ["Pulled pork sandwich", 1200],
    ].map(([name, price]) => ({ business_id: biz.id, name: name as string, description: null, price_cents: price as number, is_active: true })),
  );
  await admin.upsertSignals([
    {
      source: "seed" as const,
      term: "smoked brisket",
      normalized_term: "smoked_brisket",
      category: biz.category,
      geo: "US",
      metric_type: "search_volume",
      value: 5400,
      delta_pct: 30,
      window_days: 7,
      raw: null,
    },
    {
      source: "google_suggest" as const,
      term: "smoked brisket",
      normalized_term: "smoked_brisket",
      category: biz.category,
      geo: "US",
      metric_type: "autocomplete",
      value: null,
      delta_pct: null,
      window_days: 7,
      raw: { suggestions: ["smoked brisket near me", "best smoked brisket", "smoked brisket price per pound"] },
    },
  ]);
  await admin.upsertSeriesPoints(
    Array.from({ length: 35 }, (_, i) => ({
      normalized_term: "smoked_brisket",
      geo: "US",
      day: new Date(Date.now() - (34 - i) * DAY).toISOString().slice(0, 10),
      value: 40 + i,
    })),
  );
  await admin.upsertAdHistory(
    [
      ...[1, 2, 3].map((i) => ({ name: `Smoked brisket weekend ${i}`, clicks: 500 })),
      ...[1, 2, 3].map((i) => ({ name: `Happy hour wings ${i}`, clicks: 200 })),
    ].map((a) => ({
      business_id: biz.id,
      platform: "meta" as const,
      campaign_name: a.name,
      ad_name: null,
      copy: null,
      impressions: 20_000,
      clicks: a.clicks,
      spend_cents: 40_000,
      results: 10,
      ctr: null,
      started_on: "2026-07-01",
      ended_on: "2026-07-20",
      source: "meta_export" as const,
    })),
  );
  return { admin, user, biz };
}

const bundle = (term: string): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank: 1,
    geo: "US",
    term,
    finding: `Your customers are searching "${term}." Your menu says "Smoked brisket plate."`,
    metric_label: `Searches for "${term}"`,
    metric_value: 5400,
    metric_delta_pct: 30,
    metric_window: "week",
    sparkline: [],
    bet_what: "The brisket plate, problem first, on Reels",
    bet_budget_usd: 300,
    bet_duration_days: 6,
    bet_kill_rule: "Kill if cost per click runs 30% over your average by day 3",
    guardrail: null,
    grade: "B+",
    grade_score: 75,
    signal_scores: {},
    status: "ready",
  },
  evidence: [{ signal: "customer", claim: "Searches for it are up", source_url: null, source_label: null }],
  scripts: [],
});

describe("the ranking remembers what the brand already did", () => {
  beforeEach(() => resetStore());

  it("ranks the term when nothing was run on it", async () => {
    const { user, biz, admin } = await seed();
    const result = await recommendForBusiness(user, biz);
    const terms = await Promise.all((await user.listOpportunities(biz.id, weekOf())).map(async (o) => (await admin.getSignal(o.signal_id))!.term));
    expect(terms).toEqual(["smoked brisket"]);
    expect(result.created).toBe(1);
    expect(await user.listWeekSkips(biz.id, weekOf())).toEqual([]);
  });

  it("holds a term the brand ran and killed, and says so in the week's skips", async () => {
    const { user, biz } = await seed();
    const [pickId] = await user.replaceWeekPicks(biz.id, "2026-09-07", [bundle("smoked brisket")]);
    const run = await user.createPickRun({ pick_id: pickId, business_id: biz.id, status: "running" });
    await user.updatePickRun(run.id, { status: "killed", ended_at: new Date(Date.now() - 3 * DAY).toISOString() });

    const result = await recommendForBusiness(user, biz);
    expect(result.created).toBe(0);
    expect(result.allHeld).toBe(true);
    const skips = await user.listWeekSkips(biz.id, weekOf());
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ term: "smoked brisket", kind: "memory", grade: "Hold" });
    expect(skips[0].reason).toMatch(/^You stopped this on /);
  });

  it("does not hold a term the brand ran and won", async () => {
    const { user, biz } = await seed();
    const [pickId] = await user.replaceWeekPicks(biz.id, "2026-09-07", [bundle("smoked brisket")]);
    const run = await user.createPickRun({ pick_id: pickId, business_id: biz.id, status: "running" });
    await user.updatePickRun(run.id, { status: "completed", ended_at: new Date(Date.now() - 3 * DAY).toISOString(), verdict: "won" });
    const result = await recommendForBusiness(user, biz);
    expect(result.created).toBe(1);
  });
});
