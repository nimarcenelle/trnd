import { describe, expect, it } from "vitest";

import type { Competitor, CompetitorRead, Signal, SocialPost } from "../lib/db/types";
import {
  campaignSignalBrief,
  culturalForTerm,
  historyForTerm,
  ownSocialOnTerm,
  rivalLinesOnTerm,
  rivalTermRead,
  rivalThemes,
  type SignalContext,
} from "../lib/recommend/four-signals";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

const rival = (id: string, name: string, directness: number | null): Competitor => ({
  id,
  business_id: "b1",
  name,
  website: null,
  place_id: null,
  social_handles: {},
  directness,
  directness_reason: null,
  created_at: daysAgo(30),
});

const post = (over: Partial<SocialPost>): SocialPost => ({
  id: Math.random().toString(36).slice(2),
  business_id: "b1",
  competitor_id: null,
  platform: "instagram",
  external_id: Math.random().toString(36).slice(2),
  url: "https://instagram.com/p/x",
  caption: "",
  media_type: "video",
  posted_at: daysAgo(2),
  likes: 50,
  comments: 5,
  shares: 0,
  views: 0,
  is_ad: false,
  kind: "other",
  captured_at: daysAgo(1),
  ...over,
});

const adRead = (competitorId: string, raw: unknown): CompetitorRead => ({
  id: `r-${competitorId}`,
  competitor_id: competitorId,
  business_id: "b1",
  kind: "ads",
  value: 3,
  rating: null,
  summary: "3 active Meta ads",
  raw,
  captured_at: daysAgo(1),
});

const signal = (over: Partial<Signal>): Signal => ({
  id: "s1",
  source: "google_trends",
  term: "iced latte",
  normalized_term: "iced_latte",
  category: "Food & beverage",
  geo: "US",
  metric_type: "search_interest",
  value: 60,
  delta_pct: 20,
  window_days: 7,
  captured_at: daysAgo(0),
  raw: null,
  ...over,
});

const octane = rival("c1", "Octane", 0.8);
const goats = rival("c2", "Dancing Goats", null);

const ctx = (over: Partial<SignalContext> = {}): SignalContext => ({
  audience: null,
  direct: [octane, goats],
  rivalPosts: [
    post({ competitor_id: "c1", caption: "Iced latte season is here, $6 all week", kind: "promo", likes: 300 }),
    post({ competitor_id: "c1", caption: "Meet our new roaster", kind: "behind_scenes", likes: 40 }),
    post({ competitor_id: "c1", caption: "Saturday hours", likes: 30 }),
  ],
  ownPosts: [],
  adReads: [
    adRead("c2", {
      ads: [{ advertiser: "Dancing Goats", snippet: "Iced latte, $5, every afternoon", headline: null, runningDays: 30 }],
      themes: [{ theme: "offer", count: 3 }, { theme: "novelty", count: 1 }],
    }),
  ],
  history: [],
  shortform: [],
  ...over,
});

describe("what the direct rivals are doing on a term", () => {
  it("counts rivals posting or advertising on it, and ads that have run three weeks", () => {
    const read = rivalTermRead("iced latte", ctx());
    expect(read).toEqual({ watched: 2, onTerm: 2, names: ["Octane", "Dancing Goats"], proven: 1 });
  });

  it("says nothing when fewer than two direct rivals have been read", () => {
    expect(rivalTermRead("iced latte", ctx({ adReads: [] }))).toBeNull();
  });

  it("leaves rivals off the term out of the count", () => {
    expect(rivalTermRead("cold brew", ctx())?.onTerm).toBe(0);
  });

  it("writes one named line per move, with how long an ad has run", () => {
    const lines = rivalLinesOnTerm("iced latte", ctx());
    expect(lines.some((l) => l.startsWith("Octane: Posted a promo"))).toBe(true);
    expect(lines).toContain('Dancing Goats ad: "Iced latte, $5, every afternoon" (running 4 weeks)');
  });

  it("adds up what the rivals' ads lean on", () => {
    expect(rivalThemes(ctx())).toEqual([
      { theme: "offer", count: 3 },
      { theme: "novelty", count: 1 },
    ]);
  });
});

describe("the brand's own proof", () => {
  const own = [
    post({ caption: "Iced latte, oat milk, $6", likes: 400 }),
    post({ caption: "The iced latte you asked for", likes: 380 }),
    post({ caption: "Monday", likes: 60 }),
    post({ caption: "Team photo", likes: 50 }),
    post({ caption: "New mugs", likes: 70 }),
    post({ caption: "Rainy day", likes: 55 }),
  ];

  it("reads its own posts on a term against its usual", () => {
    const proof = ownSocialOnTerm("iced latte", own)!;
    expect(proof.count).toBe(2);
    expect(proof.lift).toBeGreaterThan(0.5);
    expect(proof.reason).toMatch(/your 2 posts on this got \d+% more engagement than your usual/);
  });

  it("does not call a handful of posts a usual", () => {
    expect(ownSocialOnTerm("iced latte", own.slice(0, 4))).toBeNull();
  });

  it("has no ad-history proof without ad history", () => {
    expect(historyForTerm("iced latte", [])).toBeNull();
  });
});

describe("culture for a search-led pick", () => {
  const shortform = signal({
    id: "s2",
    source: "tiktok",
    metric_type: "shortform_views",
    raw: { engagementPct: 6.2, actionPct: 1.4, medianDurationSec: 18 },
  });

  it("borrows the short-form read on the same term", () => {
    expect(culturalForTerm(signal({}), [shortform])).toEqual({
      platform: "tiktok",
      deltaPct: 20,
      engagementPct: 6.2,
      actionPct: 1.4,
    });
  });

  it("does not borrow for a pick that is already a short-form read", () => {
    expect(culturalForTerm(shortform, [shortform])).toBeNull();
  });

  it("hands the writer the winning length", () => {
    expect(campaignSignalBrief(signal({}), ctx({ shortform: [shortform] })).medianDurationSec).toBe(18);
  });
});

describe("the rivals Competitive watches", () => {
  it("is everyone over the bar, or the nearest three when nobody clears it", async () => {
    const { competitiveSet } = await import("../lib/recommend/four-signals");
    const far = rival("f", "Far", 0.2);
    const near1 = rival("n1", "Near one", 0.45);
    const near2 = rival("n2", "Near two", 0.35);
    const near3 = rival("n3", "Near three", 0.31);
    const near4 = rival("n4", "Near four", 0.3);
    expect(competitiveSet([octane, near1, far]).map((c) => c.id)).toEqual(["c1"]);
    expect(competitiveSet([goats, near1]).map((c) => c.id)).toEqual(["c2"]);
    expect(competitiveSet([far, near2, near4, near1, near3]).map((c) => c.id)).toEqual(["n1", "n2", "n3"]);
    expect(competitiveSet([far])).toEqual([]);
  });
});
