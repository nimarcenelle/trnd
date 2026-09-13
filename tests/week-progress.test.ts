import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-progress-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { weekProgress } = await import("../lib/picks/progress");
const { weekOf } = await import("../lib/recommend/week");

const input: NewBusiness = {
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
};

describe("the first-week progress", () => {
  beforeEach(() => resetStore());

  it("starts at the analysis with every step to do", async () => {
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(input);
    const p = await weekProgress(user, biz);
    expect(p.stage).toBe("brief");
    expect(p.steps.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(p.ranked).toEqual([]);
  });

  it("says what each finished step found, and lists the ranked terms once graded", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(input);
    await admin.upsertBusinessBrief({ business_id: biz.id, prompt_version: 1, model_used: "fallback", positioning: "p", lexicon: [], watch_terms: ["hard water", "chlorine"], subreddits: [], target_customer: null } as never);
    await admin.upsertSignals([
      { source: "seed", term: "hard water", normalized_term: "hard_water", category: biz.category, geo: "US", metric_type: "search_volume", value: 100, delta_pct: 10, window_days: 7, raw: null },
    ] as never);
    await admin.upsertSocialPosts([
      { business_id: biz.id, competitor_id: null, platform: "instagram", external_id: "p1", url: "u", caption: "c", media_type: "image", posted_at: new Date().toISOString(), likes: 1, comments: 0, shares: 0, views: 0, is_ad: false, kind: null },
    ]);
    const rival = await user.createCompetitor({ business_id: biz.id, name: "Canopy", website: null, place_id: null, social_handles: {}, directness: 0.7, directness_reason: "r" });
    const sig = (await admin.listSignalsForCategory(biz.category, { sinceDays: 1 }))[0];
    await admin.upsertOpportunities([
      { business_id: biz.id, signal_id: sig.id, week_of: weekOf(), score: 7, rationale: "r", matched_service_id: null, competitor_gap: null, relevance: null, grade: "B", grade_score: 66, signal_scores: {} },
    ]);
    const p = await weekProgress(user, biz);
    expect(p.stage).toBe("picks");
    expect(p.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "current"]);
    expect(p.steps[0].detail).toBe("2 terms to watch");
    expect(p.steps[1].detail).toBe("1 terms read across 1 sources");
    expect(p.steps[2].detail).toBe(`1 of your posts · 1 competitor: ${rival.name}`);
    expect(p.steps[3].detail).toBe("1 graded");
    expect(p.ranked).toEqual([{ term: "hard water", grade: "B" }]);
  });
});
