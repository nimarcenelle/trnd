import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, Review } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-evidence-"));
delete process.env.OPENAI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { loadGradeContext, reviewsOnAngle } = await import("../lib/scoring/gather");
const { gradeOpportunity } = await import("../lib/scoring/grade-opportunity");
const { scoreCompetitive } = await import("../lib/scoring/competitive");
const { scoreCustomer } = await import("../lib/scoring/customer");

const brand = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Rinse",
  category: "shower filter brand",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 0,
  website: "https://rinseskin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: { instagram: "rinse" },
  market: "online",
  monthly_ad_spend: "20-50k",
  ad_platforms: ["meta"],
});

const review = (over: Partial<Review>): Review =>
  ({ id: "r", business_id: "b", competitor_id: "c1", author: "a", rating: 5, text: "", published_at: null, source: "trustpilot", captured_at: "", ...over }) as Review;

describe("what reviews say about the angle", () => {
  it("counts the rivals' reviews mentioning the term and how many are complaints, against the brand's own", () => {
    const reviews = [
      review({ competitor_id: "c1", rating: 1, text: "The filter cut my water pressure to a trickle" }),
      review({ competitor_id: "c1", rating: 2, text: "Water pressure dropped after a week" }),
      review({ competitor_id: "c2", rating: 5, text: "Great pressure, love it" }),
      review({ competitor_id: "c3", rating: 1, text: "Shipping took forever" }),
      review({ competitor_id: null, rating: 5, text: "Pressure is better than my old head" }),
      review({ competitor_id: null, rating: 4, text: "Nice pressure" }),
    ];
    expect(reviewsOnAngle("pressure", reviews, new Set(["c1", "c2", "c3"]))).toEqual({
      rivalsRead: 3,
      onTerm: 3,
      lowOnTerm: 2,
      ownOnTerm: 2,
      ownLowOnTerm: 0,
    });
    expect(reviewsOnAngle("pressure", reviews.filter((r) => r.competitor_id === null), new Set(["c1"]))).toBeUndefined();
  });
});

describe("competitor weakness from reviews", () => {
  const base = {
    competitorsConnected: 3,
    competitorsRead: 3,
    evidenceItems: 20,
    rivalsOnAngleNow: 1,
    rivalsOnAnglePrior: 1,
    rivalAdsOnAngle: 0,
    weakRivalAds: 0,
    settingsHref: "/app/settings",
  };

  it("scores complaints on the angle, and says how they compare with the brand's own reviews", () => {
    const s = scoreCompetitive({ ...base, reviews: { rivalsRead: 3, onTerm: 10, lowOnTerm: 4, ownOnTerm: 8, ownLowOnTerm: 1 } });
    const weakness = s.components.find((c) => c.key === "weakness")!;
    expect(weakness.score).toBe(80);
    expect(weakness.detail).toBe("4 of 10 competitor reviews mentioning this are one or two stars, 3 times as often as yours");
  });

  it("blends with weak ads when both are read, and needs three reviews on the angle", () => {
    const both = scoreCompetitive({ ...base, rivalAdsOnAngle: 4, weakRivalAds: 0, reviews: { rivalsRead: 2, onTerm: 4, lowOnTerm: 2, ownOnTerm: null, ownLowOnTerm: null } });
    expect(both.components.find((c) => c.key === "weakness")!.score).toBe(50);
    const thin = scoreCompetitive({ ...base, reviews: { rivalsRead: 1, onTerm: 2, lowOnTerm: 2, ownOnTerm: null, ownLowOnTerm: null } });
    expect(thin.components.find((c) => c.key === "weakness")!.score).toBeNull();
  });
});

describe("intent from comments", () => {
  it("names the comments on the brand's own posts when they are the read", () => {
    const s = scoreCustomer({
      term: "hard water",
      personaMatch: 0.8,
      personaSource: "brief",
      level: 8100,
      levelBaseline: [],
      activity: [
        { text: "does it help with hair fall?", from: "comment", own: true },
        { text: "where to buy this", from: "comment", own: true },
        { text: "love the design", from: "comment", own: true },
        { text: "hard water ruined my hair", from: "comment", own: false },
      ],
      series: [],
    });
    expect(s.components.find((c) => c.key === "intent")!.detail).toBe("2 of 3 comments on your posts show a real problem or a wish to buy");
  });
});

describe("the grade reads comments and reviews", () => {
  beforeEach(() => resetStore());

  it("hears the customer under the brand's posts and the rivals' complaints in their reviews", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(brand("owner"));
    await user.createServices([{ business_id: biz.id, name: "Filtered showerhead", description: null, price_cents: 14900, is_active: true, in_stock: false }]);
    const rival = await user.createCompetitor({ business_id: biz.id, name: "Canopy", website: "https://getcanopy.co", place_id: null, social_handles: {}, directness: 0.8, directness_reason: "r" });
    await admin.upsertSignals([
      { source: "seed", term: "filtered showerhead", normalized_term: "filtered_showerhead", category: biz.category, geo: "US", metric_type: "search_volume", value: 8100, delta_pct: 10, window_days: 7, raw: null },
    ] as never);
    // The rival's ads were read, so Competitive counts.
    await admin.upsertCompetitorReads([
      { competitor_id: rival.id, business_id: biz.id, kind: "ads", value: 3, rating: null, summary: "3 active Meta ads", raw: { ads: [{ headline: "Meet the showerhead", snippet: "Design-led filtered showerhead", runningDays: 30 }] } },
    ]);
    // The brand's own post on the term, and what its customers asked under it.
    await admin.upsertSocialPosts([
      { business_id: biz.id, competitor_id: null, platform: "instagram", external_id: "own1", url: "https://instagram.com/p/own1/", caption: "Our filtered showerhead is here", media_type: "video", posted_at: new Date().toISOString(), likes: 200, comments: 40, shares: 0, views: 9000, is_ad: false, kind: null },
    ]);
    await admin.upsertSocialComments(
      ["where to buy this?", "my hair keeps shedding, does this help?", "how to fix low pressure with this?", "🔥🔥"].map((text, i) => ({
        business_id: biz.id,
        competitor_id: null,
        platform: "instagram",
        post_external_id: "own1",
        external_id: `c${i}`,
        author: "u",
        text,
        likes: 0,
        posted_at: new Date().toISOString(),
      })),
    );
    // The rival's reviews on the angle, and the brand's own.
    await admin.upsertReviews([
      ...["Filtered showerhead cut my pressure", "The filtered showerhead leaks at the joint", "Filtered showerhead broke in a month"].map((text, i) => ({
        business_id: biz.id, competitor_id: rival.id, author: `r${i}`, rating: 1, text, published_at: null, source: "trustpilot" as const,
      })),
      { business_id: biz.id, competitor_id: rival.id, author: "r9", rating: 5, text: "Best filtered showerhead I have owned", published_at: null, source: "trustpilot" as const },
      ...["Filtered showerhead works great", "Love this filtered showerhead", "Filtered showerhead: pressure held up"].map((text, i) => ({
        business_id: biz.id, competitor_id: null, author: `o${i}`, rating: 5, text, published_at: null, source: "trustpilot" as const,
      })),
    ]);

    const signal = (await admin.listSignalsForCategory(biz.category, { sinceDays: 1 }))[0];
    const ctx = await loadGradeContext(user, biz);
    expect(ctx.comments).toHaveLength(4);
    expect(ctx.reviews).toHaveLength(7);
    const { grade } = await gradeOpportunity(user, biz, signal, ctx, { fit: 0.9 });

    const intent = grade.signals.customer.components.find((c) => c.key === "intent")!;
    expect(intent.detail).toBe("3 of 4 comments on your posts show a real problem or a wish to buy");
    const weakness = grade.signals.competitive.components.find((c) => c.key === "weakness")!;
    // The rival's one ad on the angle is still running (not weak); its reviews say otherwise.
    expect(weakness.detail).toBe("0 of 1 competitor ad on this angle look weak; 3 of 4 competitor reviews mentioning this are one or two stars, and none of your 3 are");
    expect(weakness.score).toBe(50);
    // Stock, read from the catalog, reaches the economics read.
    const economics = grade.signals.brand.components.find((c) => c.key === "economics")!;
    expect(economics.score).toBe(0);
    expect(economics.detail).toContain("out of stock");
  });
});
