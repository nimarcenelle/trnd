import { describe, expect, it } from "vitest";

import {
  buildInsights,
  buildNextAction,
  launchByFor,
  buildResultsTakeaway,
} from "../lib/recommend/insights";
import type { Learning, Signal } from "../lib/db/types";
import type { ScoredOpportunity } from "../lib/scoring";

const signal = (over: Partial<Signal> = {}): Signal => ({
  id: "s1",
  source: "seed",
  term: "korean glass skin facial",
  normalized_term: "korean_glass_skin_facial",
  category: "Health & beauty",
  geo: "US",
  metric_type: "conversation",
  value: 73,
  delta_pct: 47,
  window_days: 7,
  captured_at: new Date().toISOString(),
  raw: null,
  ...over,
});

const scored = (over: Partial<ScoredOpportunity> = {}): ScoredOpportunity => ({
  score: 7.8,
  localityBonus: 0,
  components: { normalizedDelta: 0.94, serviceMatch: 0.8, competitorGap: 0.6, historicalLift: 0.67 },
  matchedService: {
    id: "svc1",
    business_id: "b1",
    name: "Facial balancing consult",
    description: null,
    price_cents: 9900,
    is_active: true,
  },
  rationale: "r",
  competitorGapText: "g",
  ...over,
});

const learnings: Learning[] = [
  { id: "l1", category: "Health & beauty", geo_bucket: "US", angle_type: "education", lift: 0.72, sample_size: 14, source: "measured" as const, updated_at: "" },
  { id: "l2", category: "Health & beauty", geo_bucket: "US", angle_type: "offer", lift: 0.6, sample_size: 9, source: "seed" as const, updated_at: "" },
];

describe("insight engine", () => {
  it("produces exactly four scannable insights with short headlines", () => {
    const out = buildInsights(signal(), scored(), { learnings });
    expect(out.map((i) => i.kind)).toEqual(["momentum", "fit", "gap", "history"]);
    for (const ins of out) {
      expect(ins.headline.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(ins.detail.length).toBeGreaterThan(20);
    }
  });

  it("adapts fit and gap wording to the data", () => {
    const noMatch = buildInsights(signal(), scored({ matchedService: null }), { learnings });
    expect(noMatch.find((i) => i.kind === "fit")!.headline).toMatch(/New offer/);

    const crowded = buildInsights(
      signal(),
      scored({ components: { normalizedDelta: 0.9, serviceMatch: 0.8, competitorGap: 0.2, historicalLift: 0.5 } }),
      { learnings },
    );
    expect(crowded.find((i) => i.kind === "gap")!.headline).toMatch(/Crowded/);
  });

  it("action is a move in the real world, never a chore about using TRND", () => {
    const a = buildNextAction({
      hasCampaign: false,
      launchBy: "Aug 27",
      priceBand: "$$",
      term: "bike tune up nyc",
      serviceName: "Basic Tune-Up",
      servicePrice: "$99",
    });
    expect(a.label).toBe("Quote Basic Tune-Up at $99 to everyone asking about “bike tune up nyc”");
    expect(a.label).not.toMatch(/build the campaign|under a minute/i);
    expect(a.detail).toContain("Aug 27");
    expect(a.detail).toContain("$25–50");
    const bare = buildNextAction({ hasCampaign: false, launchBy: "Aug 27", priceBand: "$$" });
    expect(bare.label).not.toMatch(/build the campaign/i);
    const live = buildNextAction({ hasCampaign: true, launchBy: "Aug 27", priceBand: "$$", term: "bike tune up nyc" });
    expect(live.label).toMatch(/live by Aug 27/);
  });

  it("launch-by is three days into the week but never today or earlier", () => {
    const monday = Date.UTC(2026, 8, 7);
    expect(launchByFor("2026-09-07", monday)).toBe("2026-09-10");
    expect(launchByFor("2026-09-07", Date.UTC(2026, 8, 10, 15))).toBe("2026-09-11");
  });

  it("results takeaway is one line, never a paragraph", () => {
    const t = buildResultsTakeaway({ avgCtr: 0.025, benchmark: 0.018, roas: 6.9 });
    expect(t).toBeTruthy();
    expect(t!).not.toContain("\n");
    expect(t!).toMatch(/scale the winner/);
    expect(buildResultsTakeaway({ avgCtr: null, benchmark: 0.018, roas: null })).toBeNull();
  });
});

describe("history insight provenance", () => {
  it("never presents seeded priors as real campaigns", () => {
    const seedOnly = learnings.filter((l) => l.source === "seed");
    const out = buildInsights(signal(), scored(), { learnings: seedOnly });
    const history = out.find((i) => i.kind === "history")!;
    expect(history.headline).toMatch(/No results recorded yet/);
    expect(history.detail).not.toMatch(/\d+ recorded/);
  });
  it("counts only measured results as track record", () => {
    const out = buildInsights(signal(), scored(), { learnings });
    const history = out.find((i) => i.kind === "history")!;
    expect(history.detail).toMatch(/14 recorded results/);
  });
});

describe("short-form momentum insights", () => {
  const shortform = (raw: Record<string, unknown>, delta: number | null = 62) =>
    buildInsights(
      signal({
        source: "youtube",
        metric_type: "shortform_views",
        value: 1_240_000,
        delta_pct: delta,
        raw,
      }),
      scored(),
      { learnings },
    )[0];

  it("says the shorts read in views, uploads and the video doing the work", () => {
    const momentum = shortform({
      uploads: 14,
      uploadsPrev: 9,
      top: { id: "abc", title: "the 60-second color test", channel: "Studio A", views: 400_000 },
    });
    expect(momentum.kind).toBe("momentum");
    // The delta is velocity, not raw views, so the headline must not claim
    // "more views than last week" — a different and unmeasured statement.
    expect(momentum.headline).toBe("Shorts on this are climbing ↑62%");
    expect(momentum.headline).not.toMatch(/views/);
    expect(momentum.detail).toContain("1.2M views");
    expect(momentum.detail).toContain("14 new videos");
    expect(momentum.detail).toContain("More creators posted");
    expect(momentum.detail).toContain("the 60-second color test");
  });

  it("names the format: length, engagement, and who keeps working it", () => {
    const momentum = shortform({
      uploads: 14,
      uploadsPrev: 9,
      medianDurationSec: 18,
      engagementPct: 6.4,
      repeatChannels: ["Studio A", "Studio B"],
      top: { id: "abc", title: "the 60-second color test", channel: "Studio A", views: 400_000 },
      breakout: { id: "xyz", title: "undertone in one take", channel: "Nobody Studio", views: 40_000 },
    });
    expect(momentum.detail).toContain("about 18s");
    expect(momentum.detail).toContain("6.4%");
    expect(momentum.detail).toMatch(/Studio A has posted more than once/);
    expect(momentum.detail).toContain("undertone in one take");
  });

  it("warns when the views are passive rather than engaged", () => {
    const momentum = shortform({ uploads: 5, uploadsPrev: 5, engagementPct: 0.6 });
    expect(momentum.detail).toMatch(/Engagement is thin/);
    expect(momentum.detail).toMatch(/lead with the offer/);
  });

  it("discloses a widened read instead of passing it off as the local term", () => {
    const momentum = shortform({ uploads: 6, uploadsPrev: 4, adjusted: true, measuredTerm: "cold plunge" });
    expect(momentum.detail).toContain('Measured on "cold plunge"');
  });

  it("does not repeat the top video as the breakout when they are the same", () => {
    const momentum = shortform({
      uploads: 3,
      uploadsPrev: 2,
      top: { id: "abc", title: "same video", channel: "Studio A", views: 400_000 },
      breakout: { id: "abc", title: "same video", channel: "Studio A", views: 400_000 },
    });
    expect(momentum.detail.match(/same video/g)).toHaveLength(1);
  });

  it("is honest that a tiktok board read is national, not local", () => {
    const [momentum] = buildInsights(
      signal({ source: "tiktok", metric_type: "conversation", value: 27_888, delta_pct: 24, raw: { hashtagName: "glassskin" } }),
      scored(),
      { learnings },
    );
    expect(momentum.headline).toBe("↑24% posts on TikTok this week");
    expect(momentum.detail).toContain("#glassskin");
    expect(momentum.detail).toMatch(/national/i);
  });
});
