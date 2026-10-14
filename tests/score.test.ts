import { describe, expect, it } from "vitest";

import type { Ad } from "@/lib/db/types";
import { conversionScore, longevityPart, matchPost, reachPart, repetitionPart, tierOf, topHooks, topicsByScore, versionsOf } from "@/lib/score";
import { mapFacebook } from "@/lib/social/read";

const ad = (over: Partial<Ad>): Ad => ({
  id: "a1",
  brand_id: "b",
  rival_id: "r",
  archive_id: "1",
  page_name: "Rival",
  body: "I blamed my shampoo for three years. It was my water. The filtered showerhead removes chlorine in minutes.",
  title: null,
  cta: null,
  link_url: null,
  format: "video",
  image_url: null,
  video_url: null,
  platforms: [],
  variants: 1,
  started_at: "2026-08-15",
  active: true,
  first_seen_at: "",
  last_seen_at: "",
  stopped_at: null,
  angle: null,
  hook: null,
  offer: null,
  ...over,
});

describe("conversion score parts", () => {
  it("rewards longevity on a curve, reach rank, and versions", () => {
    expect(longevityPart(0)).toBe(0);
    expect(longevityPart(30)).toBeCloseTo(0.72, 2);
    expect(longevityPart(500)).toBe(1);
    expect(reachPart(0, 20)).toBe(1);
    expect(reachPart(19, 20)).toBe(0);
    expect(reachPart(0, 2)).toBeNull();
    expect(repetitionPart(1)).toBe(0);
    expect(repetitionPart(8)).toBe(1);
  });

  it("matches an ad to the organic post that carries its copy, judged against the usual post", () => {
    const pools = [
      {
        platform: "instagram" as const,
        posts: [
          { url: "u1", caption: "I blamed my shampoo for three years. It was my water! Filtered showerhead removes chlorine.", posted_at: null, likes: 900, comments: 50, views: null, kind: null },
          { url: "u2", caption: "Meet the team behind the brand", posted_at: null, likes: 100, comments: 0, views: null, kind: null },
          { url: "u3", caption: "Our summer bundle is here", posted_at: null, likes: 200, comments: 10, views: null, kind: null },
        ],
      },
    ];
    const m = matchPost(ad({}), pools);
    expect(m).toMatchObject({ platform: "instagram", url: "u1", likes: 900, comments: 50, baseline: 220 });
    expect(matchPost(ad({ body: "Our summer sale is on" }), pools)).toBeNull();
  });

  it("blends what it has and says how sure it is", () => {
    const today = "2026-10-14";
    const bare = conversionScore({ ad: ad({}), versions: 1, today });
    expect(bare.parts).toMatchObject({ engagement: null, reach: null, confidence: "low" });
    const withReach = conversionScore({ ad: ad({ impression_rank: 0, rank_total: 20 }), versions: 4, today });
    expect(withReach.parts.confidence).toBe("medium");
    expect(withReach.score).toBeGreaterThan(bare.score);
    const viral = conversionScore({
      ad: ad({ impression_rank: 0, rank_total: 20, engagement: { platform: "facebook", url: "x", likes: 4000, comments: 300, shares: 200, views: null, sentiment: 0.8, baseline: 300 } }),
      versions: 4,
      today,
    });
    expect(viral.parts.confidence).toBe("high");
    expect(viral.score).toBeGreaterThan(withReach.score);
    const flop = conversionScore({ ad: ad({ started_at: "2026-10-12", impression_rank: 19, rank_total: 20 }), versions: 1, today });
    expect(flop.score).toBeLessThan(30);
    expect(tierOf(viral.score)).toBe("top");
    expect(tierOf(flop.score)).toBe("weak");
  });

  it("counts other ads with the same opening as versions", () => {
    const a = ad({ id: "a", hook: "I blamed my shampoo for three years", variants: 2 });
    const b = ad({ id: "b", hook: "I blamed my shampoo for three years!" });
    expect(versionsOf(a, [a, b])).toBe(3);
  });
});

describe("topics and hooks", () => {
  it("ranks topics by the scores they carry, and keeps one of each hook", () => {
    const ads = [
      { topic: "hard water", score: 90, hook: "Your shampoo isn't the problem." },
      { topic: "Hard water", score: 80, hook: "Your shampoo isn't the problem" },
      { topic: "price", score: 30, hook: "$35 beats $150" },
      { topic: "price", score: 20, hook: null },
      { topic: "eczema", score: 85, hook: "Why your eczema flares in the shower" },
    ];
    expect(topicsByScore(ads).map((t) => [t.topic, t.ads, t.avgScore])).toEqual([
      ["hard water", 2, 85],
      ["eczema", 1, 85],
      ["price", 2, 25],
    ]);
    expect(topHooks(ads).map((a) => a.hook)).toEqual(["Your shampoo isn't the problem.", "Why your eczema flares in the shower", "$35 beats $150"]);
  });
});

describe("facebook posts", () => {
  it("reads likes, comments and shares off the posts actor", () => {
    const read = mapFacebook("123", [
      { text: "I blamed my shampoo", url: "https://facebook.com/p/1", likes: 120, comments: 14, shares: 9, time: "2026-10-01T00:00:00Z", pageName: "Clearwell" },
      { url: "https://facebook.com/p/2" },
    ]);
    expect(read).toMatchObject({ platform: "facebook", handle: "123", displayName: "Clearwell" });
    expect(read?.recent).toEqual([
      { url: "https://facebook.com/p/1", caption: "I blamed my shampoo", posted_at: "2026-10-01T00:00:00.000Z", likes: 120, comments: 14, shares: 9, views: null, kind: "post" },
    ]);
    expect(mapFacebook("123", [])).toBeNull();
  });
});
