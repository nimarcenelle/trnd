import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { AdHistory, NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-classify-"));
delete process.env.OPENAI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { classifyAdHistory, classifyAdRules, classificationOf, formatOf, hookTypeOf, RULES_CLASSIFIER } = await import("../lib/ads/classify");
const { angleLine, readByAngle } = await import("../lib/ads/history-read");

/**
 * Every ad the brand ran, classified by angle, opening and format, so the
 * record reads the whole account. The rules stand in for the model and
 * for any row the model did not answer.
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

describe("the rules classifier", () => {
  it("reads the kind of opening from the first line", () => {
    expect(hookTypeOf("Why does my hair feel like straw after every shower? The filter fixes it.")).toBe("question");
    expect(hookTypeOf("Stop blaming your shampoo.")).toBe("callout");
    expect(hookTypeOf("Filtered showerhead vs the one you have. Same water, different hair.")).toBe("comparison");
    expect(hookTypeOf("I blamed my shampoo for a year. Then I looked at the showerhead.")).toBe("story");
    expect(hookTypeOf("Watch the water change colour in one take.")).toBe("demonstration");
    expect(hookTypeOf("20% off the filter this week only. Code SHOWER.")).toBe("offer");
    expect(hookTypeOf("Tired of frizz nothing fixes? It is the water.")).toBe("question");
    expect(hookTypeOf("Sick of dry hair after the shower. The water is the problem.")).toBe("problem");
    expect(hookTypeOf("Finally, a showerhead that filters what the city puts in.")).toBe("claim");
    expect(hookTypeOf("")).toBe("other");
  });

  it("reads the format from the ad name first, then the creative's shape", () => {
    expect(formatOf({ ad_name: "UGC_jenna_v2", creative_kind: "video", copy: null })).toBe("ugc");
    expect(formatOf({ ad_name: "Founder to camera", creative_kind: "video", copy: null })).toBe("talking_head");
    expect(formatOf({ ad_name: "Static_blue", creative_kind: "image", copy: null })).toBe("static");
    expect(formatOf({ ad_name: "Q3 carousel", creative_kind: "carousel", copy: null })).toBe("carousel");
    expect(formatOf({ ad_name: "v7", creative_kind: "video", copy: null })).toBe("video");
    expect(formatOf({ ad_name: "v7", creative_kind: "image", copy: null })).toBe("static");
    expect(formatOf({ ad_name: null, creative_kind: null, copy: null })).toBe("unknown");
  });

  it("classifies a row whole, and prefers a stored classification", () => {
    expect(classifyAdRules({ copy: "Only 40 left. Once they are gone the price goes back up.", ad_name: "UGC_v1", campaign_name: "P", creative_kind: "video" })).toEqual({
      angle: "scarcity",
      hook_type: "other",
      format: "ugc",
    });
    expect(classificationOf(row({ copy: "Only 40 left.", angle: "education", hook_type: "story", format: "demo" }))).toEqual({ angle: "education", hook_type: "story", format: "demo" });
    expect(classificationOf(row({ copy: "Only 40 left.", angle: "education" })).angle).toBe("scarcity");
  });
});

describe("classifying a brand's history", () => {
  beforeEach(() => resetStore());

  it("writes the rules' read on every unclassified row and leaves classified rows alone", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    await repo.upsertAdHistory([
      { ...row({ copy: "Why does my hair feel like straw?", impressions: 100 }), business_id: biz.id, campaign_name: "A" },
      { ...row({ copy: "20% off this week", impressions: 100, angle: "novelty", hook_type: "story", format: "studio", classifier: "gpt-test" }), business_id: biz.id, campaign_name: "B" },
      { ...row({ copy: null, ad_name: null, impressions: 100 }), business_id: biz.id, campaign_name: "" },
    ]);
    const result = await classifyAdHistory(repo, biz.id, { classifier: null });
    expect(result).toEqual({ classified: 1, model: null });
    const rows = await repo.listAdHistory(biz.id);
    const a = rows.find((r) => r.campaign_name === "A")!;
    expect(a).toMatchObject({ angle: "education", hook_type: "question", format: "unknown", classifier: RULES_CLASSIFIER });
    expect(rows.find((r) => r.campaign_name === "B")).toMatchObject({ angle: "novelty", classifier: "gpt-test" });
    expect(await classifyAdHistory(repo, biz.id, { classifier: null })).toEqual({ classified: 0, model: null });
  });

  it("takes the model's read where it answered and the rules' where it did not", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    await repo.upsertAdHistory([
      { ...row({ copy: "Why does my hair feel like straw?", impressions: 100 }), business_id: biz.id, campaign_name: "A" },
      { ...row({ copy: "Only 40 left.", impressions: 100 }), business_id: biz.id, campaign_name: "B" },
    ]);
    const result = await classifyAdHistory(repo, biz.id, {
      classifier: async (rows) => ({ byId: { [rows.find((r) => r.campaign_name === "A")!.id]: { angle: "social_proof", hook_type: "story", format: "ugc" } }, model: "gpt-test" }),
    });
    expect(result).toEqual({ classified: 2, model: "gpt-test" });
    const rows = await repo.listAdHistory(biz.id);
    expect(rows.find((r) => r.campaign_name === "A")).toMatchObject({ angle: "social_proof", classifier: "gpt-test" });
    expect(rows.find((r) => r.campaign_name === "B")).toMatchObject({ angle: "scarcity", classifier: RULES_CLASSIFIER });
  });
});

describe("the record by angle", () => {
  it("reads click-through, cost per purchase and the video rates per angle against the account", () => {
    const rows = [
      row({ copy: "Why does the water do this to hair? Here is what a filter removes.", impressions: 10000, clicks: 300, spend_cents: 50000, purchases: 20, video_3s_views: 3000, thruplays: 900 }),
      row({ copy: "How hard water works on hair, explained.", impressions: 10000, clicks: 200, spend_cents: 50000, purchases: 20, video_3s_views: 2000, thruplays: 400 }),
      row({ copy: "20% off the filter this week.", impressions: 20000, clicks: 200, spend_cents: 100000, purchases: 20, video_3s_views: 4000, thruplays: 1000 }),
    ];
    const read = readByAngle(rows);
    expect(read.resultKind).toBe("purchase");
    expect(read.accountCtr).toBeCloseTo(700 / 40000);
    expect(read.accountCpaCents).toBeCloseTo(200000 / 60);
    const edu = read.byAngle.find((a) => a.angle === "education")!;
    const offer = read.byAngle.find((a) => a.angle === "offer")!;
    expect(edu.ads).toBe(2);
    expect(edu.ctr).toBeCloseTo(500 / 20000);
    expect(edu.cpaCents).toBeCloseTo(2500);
    expect(edu.vsAccountCpa).toBeCloseTo(2500 / (200000 / 60));
    expect(edu.hookRate).toBeCloseTo(0.25);
    expect(edu.holdRate).toBeCloseTo(1300 / 5000);
    expect(offer.vsAccountCpa).toBeCloseTo(5000 / (200000 / 60));
    expect(angleLine(read)).toBe("Education angles ran 25% cheaper per purchase than your account across 2 ads.");
  });

  it("falls back to the platform's results, then to click-through, and says nothing on a thin account", () => {
    const thin = readByAngle([row({ copy: "Why?", impressions: 200, clicks: 10, spend_cents: 1000, results: 1 })]);
    expect(thin.resultKind).toBe("result");
    expect(angleLine(thin)).toBeNull();
    const byCtr = readByAngle([
      row({ copy: "Why does the water do this? Explained.", impressions: 5000, clicks: 200 }),
      row({ copy: "How it works, explained.", impressions: 5000, clicks: 200 }),
      row({ copy: "20% off.", impressions: 10000, clicks: 100 }),
    ]);
    expect(byCtr.resultKind).toBeNull();
    expect(angleLine(byCtr)).toMatch(/^Education angles beat your account click-through by \d+% across 2 ads\.$/);
    expect(readByAngle([]).byAngle).toEqual([]);
  });
});
