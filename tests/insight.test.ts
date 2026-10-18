import { describe, expect, it } from "vitest";

import type { Ad, SocialProfile } from "@/lib/db/types";
import { adMovesTakeaway, angleMeaning, explainScore, socialFlags, youVsMarket } from "@/lib/insight";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);
let n = 0;
const ad = (rival: string, score: number, over: Partial<Ad> = {}): Ad =>
  ({ id: `a${++n}`, archive_id: `x${n}`, rival_id: rival, score, active: true, variants: 1, started_at: daysAgo(10), stopped_at: null, topic: null, hook: null, angle: null, ...over }) as unknown as Ad;

describe("explainScore", () => {
  it("says why in plain words: longevity against the market, versions, reach and the organic post", () => {
    const market = Array.from({ length: 20 }, (_, i) => ad("m", 50, { started_at: daysAgo(i + 1) }));
    const best = ad("c", 96, {
      started_at: daysAgo(300),
      variants: 10,
      impression_rank: 0,
      rank_total: 20,
      engagement: { platform: "instagram", url: null, likes: 15000, comments: 150, shares: 100, views: null, sentiment: 0.5, baseline: 2500 },
    });
    const why = explainScore(best, [...market, best], 1, NOW);
    expect(why[0]).toMatch(/^Live 300 days, longer than 95% of the 21 live ads/);
    expect(why).toContain("10 versions running: they keep making more of it, which they do when it pays.");
    expect(why).toContain("#1 of 20 of their ads by impressions.");
    expect(why.some((w) => /15\.0K likes.*6\.2× their usual post/.test(w))).toBe(true);
    expect(why).toContain("Commenters are mostly positive.");
  });
});

describe("angleMeaning", () => {
  it("explains a tag in a sentence and never comes back empty", () => {
    expect(angleMeaning("Social proof")).toMatch(/reviews, ratings/);
    expect(angleMeaning("UGC testimonial")).toMatch(/reviews, ratings|customer or creator/);
    expect(angleMeaning("something odd")).toBeTruthy();
    expect(angleMeaning(null)).toBeNull();
  });
});

describe("youVsMarket", () => {
  const names = (id: string) => ({ c: "Clearwell", t: "Tidewell" })[id] ?? "?";
  it("finds what works for you, what you miss and where you are weaker", () => {
    const them = [
      ad("c", 90, { topic: "eczema", hook: "Why your eczema flares", angle: "expert authority" }),
      ad("c", 85, { topic: "eczema", angle: "expert authority" }),
      ad("t", 80, { topic: "price", hook: "Why pay $135?" }),
      ad("t", 40, { topic: "price" }),
      ad("t", 30, { topic: "hair" }),
    ];
    const you = [ad("me", 88, { topic: "hair", hook: "Hard water wrecks hair" }), ad("me", 35, { topic: "price" })];
    const r = youVsMarket({ you, them, nameOf: names });
    expect(r.working[0]).toMatch(/^“Hard water wrecks hair” scores 88/);
    expect(r.missing[0]).toBe("Eczema: 2 competitor ads averaging 88, led by Clearwell. You run none.");
    expect(r.missing.some((m) => m.startsWith("The expert authority angle"))).toBe(true);
    expect(r.better[0]).toMatch(/^Price: yours average 35, theirs 60\. The one to beat: Tidewell's “Why pay \$135\?” \(80\)\./);
  });
  it("says so when the brand has no scored ads", () => {
    const r = youVsMarket({ you: [], them: [ad("c", 70, { topic: "eczema" })], nameOf: names });
    expect(r.working).toEqual([]);
    expect(r.better[0]).toMatch(/haven't scored any of your own ads/);
  });
});

describe("adMovesTakeaway", () => {
  it("names who pushed hardest", () => {
    const changes = [
      { kind: "launched", rival_id: "s", ad: ad("s", 50, { topic: "Bedding" }) },
      { kind: "launched", rival_id: "s", ad: ad("s", 50, { topic: "Bedding" }) },
      { kind: "launched", rival_id: "d", ad: null },
    ];
    expect(adMovesTakeaway(changes, (id) => (id === "s" ? "Serena & Lily" : "Dormify"))).toMatch(/^Serena & Lily launched 2 of 3 new ads, mostly bedding\./);
    expect(adMovesTakeaway([], () => "")).toBeNull();
  });
});

describe("socialFlags", () => {
  const p = (id: string, er: number, over: Partial<SocialProfile> = {}): SocialProfile =>
    ({ id, platform: "instagram", followers: 1000, engagement_rate: er, error: null, recent: [], ...over }) as unknown as SocialProfile;
  it("flags fast growth and engagement far from the set, and stays quiet otherwise", () => {
    const peers = [p("a", 0.01), p("b", 0.012), p("c", 0.011)];
    expect(socialFlags(p("x", 0.03), { from: 1000, to: 1050, days: 30 }, peers)).toEqual([
      "Grew 5.0% in 30 days: something is landing.",
      "Engagement 3.00%, over twice the 1.10% typical of the accounts you watch.",
    ]);
    expect(socialFlags(p("y", 0.011), { from: 1000, to: 1005, days: 30 }, peers)).toEqual([]);
  });
});
