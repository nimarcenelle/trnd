import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Business, NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-week-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { nextWeekStage, runWeekStage } = await import("../lib/picks/advance-week");
const { weekOf } = await import("../lib/recommend/week");

const input = (over: Partial<NewBusiness> = {}): NewBusiness => ({
  owner_id: "owner",
  name: "Rinse",
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
  market: "online",
  monthly_ad_spend: "20-50k",
  ad_platforms: ["meta"],
  ...over,
});

const brief = (biz: Business) => ({
  business_id: biz.id,
  prompt_version: 1,
  model_used: "fallback",
  positioning: "p",
  lexicon: [],
  watch_terms: ["hard water"],
  subreddits: [],
  target_customer: null,
});

async function seed(opts: { brief?: boolean; signalToday?: boolean; opportunity?: boolean; posts?: boolean } = {}) {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(input());
  if (opts.brief !== false) await admin.upsertBusinessBrief(brief(biz) as never);
  if (opts.signalToday !== false) {
    await admin.upsertSignals([
      { source: "seed", term: "hard water", normalized_term: "hard_water", category: biz.category, geo: "US", metric_type: "search_volume", value: 100, delta_pct: 10, window_days: 7, raw: null },
    ] as never);
  }
  if (opts.posts !== false) {
    await admin.upsertSocialPosts([
      { business_id: biz.id, competitor_id: null, platform: "instagram", external_id: "p1", url: "https://instagram.com/p/p1", caption: "hard water fix", media_type: "image", posted_at: new Date().toISOString(), likes: 10, comments: 1, shares: 0, views: 0, is_ad: false, kind: null },
    ]);
  }
  if (opts.opportunity) {
    const sig = (await admin.listSignalsForCategory(biz.category, { sinceDays: 1 }))[0];
    await admin.upsertOpportunities([
      { business_id: biz.id, signal_id: sig.id, week_of: weekOf(), score: 7, rationale: "r", matched_service_id: null, competitor_gap: null, relevance: null, grade: "B", grade_score: 66, signal_scores: {} },
    ]);
  }
  return { admin, user, biz };
}

describe("what a week still needs", () => {
  beforeEach(() => resetStore());

  it("starts with the analysis", async () => {
    const { user, biz } = await seed({ brief: false });
    expect(await nextWeekStage(user, biz)).toBe("brief");
  });

  it("scans a fresh signup's market when nothing was read today", async () => {
    const { user, biz } = await seed({ signalToday: false });
    expect(await nextWeekStage(user, biz)).toBe("scan");
    // Unless a scan is not allowed here (no paid readers): straight on.
    expect(await nextWeekStage(user, biz, { scanAllowed: false })).not.toBe("scan");
  });

  it("reads the brand's own accounts and rivals before ranking a fresh signup", async () => {
    const { user, biz } = await seed({ posts: false });
    expect(await nextWeekStage(user, biz)).toBe("intel");
  });

  it("ranks when the market is read and nothing is ranked, then writes picks, then is done", async () => {
    const { admin, user, biz } = await seed();
    expect(await nextWeekStage(user, biz)).toBe("rank");
    const ranked = await seed({ opportunity: true });
    expect(await nextWeekStage(ranked.user, ranked.biz)).toBe("picks");
    await admin.replaceWeekPicks(ranked.biz.id, weekOf(), [
      {
        pick: { opportunity_id: null, rank: 1, geo: "US", term: "hard water", finding: "f", metric_label: "m", metric_value: null, metric_delta_pct: null, metric_window: "30d", sparkline: [], bet_what: "b", bet_budget_usd: 1000, bet_duration_days: 5, bet_kill_rule: "k", guardrail: null, status: "draft" },
        evidence: [],
        scripts: [],
      },
    ]);
    expect(await nextWeekStage(ranked.user, ranked.biz)).toBe("done");
  });

  it("calls a week that was ranked today and held everything done, not still writing", async () => {
    const { admin, user, biz } = await seed();
    await admin.upsertSignalReadings([{ business_id: biz.id, signal: "customer", term: "hard_water", reading: { level_search_volume: 100 } }]);
    expect(await nextWeekStage(user, biz)).toBe("done");
  });

  it("does not wait on a market with nothing to rank", async () => {
    const { user, biz } = await seed({ signalToday: false });
    expect(await nextWeekStage(user, biz, { scanAllowed: false })).toBe("done");
  });
});

describe("running a stage", () => {
  beforeEach(() => resetStore());

  it("runs the one stage asked for and says what comes next", async () => {
    const { admin, biz } = await seed({ posts: false });
    const ran: string[] = [];
    const deps = {
      intel: async () => {
        ran.push("intel");
      },
      rank: async () => {
        ran.push("rank");
      },
      picks: async () => {
        ran.push("picks");
      },
    };
    expect(await runWeekStage(admin, biz, "intel", deps)).toBe("rank");
    // Nothing ranked by the fake: the week is done, not looping on rank.
    expect(await runWeekStage(admin, biz, "rank", deps)).toBe("done");
    expect(await runWeekStage(admin, biz, "picks", deps)).toBe("done");
    expect(ran).toEqual(["intel", "rank", "picks"]);
  });

  it("logs a failed stage and stops rather than throwing into the route", async () => {
    const { admin, biz } = await seed();
    const next = await runWeekStage(admin, biz, "rank", {
      rank: async () => {
        throw new Error("model down");
      },
    });
    expect(next).toBe("done");
  });
});

describe("where the job is asked for", () => {
  it("builds the job url on the origin it is given, with the hop", async () => {
    const { jobUrl } = await import("../lib/picks/kick");
    expect(jobUrl("abc", 0, "https://www.usetrnd.com").toString()).toBe("https://www.usetrnd.com/api/jobs/week?business=abc");
    expect(jobUrl("abc", 2, "https://www.usetrnd.com").searchParams.get("hop")).toBe("2");
  });
});

describe("a read the budget cut short", () => {
  beforeEach(() => resetStore());

  it("runs the same stage again until it finishes, then moves on", async () => {
    const { admin, biz } = await seed({ posts: false });
    let calls = 0;
    const intel = async () => ({ exhausted: calls++ === 0 });
    expect(await runWeekStage(admin, biz, "intel", { intel })).toBe("intel");
    expect(await runWeekStage(admin, biz, "intel", { intel })).toBe("rank");
    const scan = async () => ({ exhausted: true });
    expect(await runWeekStage(admin, biz, "scan", { scan })).toBe("scan");
  });
});
