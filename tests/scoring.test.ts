import { describe, expect, it } from "vitest";

import type { Learning, Service, Signal } from "../lib/db/types";
import {
  applyRelevance,
  competitorGap,
  historicalLift,
  matchService,
  momentum,
  normalizedDelta,
  trendPct,
  scoreOpportunity,
  weekPctFromSeries,
} from "../lib/scoring";

const signal = (over: Partial<Signal> = {}): Signal => ({
  id: "s1",
  source: "seed",
  term: "facial balancing",
  normalized_term: "facial_balancing",
  category: "Health & beauty",
  // A ranked pick is demand measured where the customers are. The fixture
  // used to be national "conversation", which is the one shape that is
  // explicitly gated — see the national-conversation test below.
  geo: "US-NY",
  metric_type: "search_interest",
  value: 77,
  delta_pct: 38,
  window_days: 7,
  captured_at: new Date().toISOString(),
  raw: null,
  ...over,
});

const service = (name: string): Service => ({
  id: `svc-${name}`,
  business_id: "b1",
  name,
  description: null,
  price_cents: 9900,
  is_active: true,
});

describe("scoring components", () => {
  it("normalizes delta with saturation at +50%", () => {
    expect(normalizedDelta(0)).toBe(0);
    expect(normalizedDelta(25)).toBe(0.5);
    expect(normalizedDelta(50)).toBe(1);
    expect(normalizedDelta(500)).toBe(1);
    expect(normalizedDelta(null)).toBe(0.5);
  });

  it("matches services by token overlap", () => {
    const m = matchService(signal(), [service("Facial balancing consult"), service("Botox")]);
    expect(m.service?.name).toBe("Facial balancing consult");
    expect(m.score).toBeGreaterThan(0.6);
    const none = matchService(signal({ term: "cold plunge" }), [service("Botox")]);
    expect(none.service).toBeNull();
    expect(none.score).toBeLessThan(0.5);
  });

  it("scores competition as unknown, never open, without a real ad read", () => {
    // News mentions are context, not rivals: zero mentions is not an open field.
    expect(competitorGap({ coverageCount: 0 }).score).toBe(0.55);
    expect(competitorGap({ coverageCount: 0 }).basis).toBe("none");
    expect(competitorGap({ coverageCount: 15 }).score).toBe(0.55);
    expect(competitorGap({ coverageCount: null }).score).toBe(0.55);
    expect(competitorGap({ coverageCount: null }).reason).toMatch(/unknown, not open/);
    // A national keyword total is not a local competitor count either.
    const national = competitorGap({ coverageCount: 1, adCount: 520 });
    expect(national.score).toBe(0.55);
    expect(national.basis).toBe("none");
    expect(national.reason).toMatch(/national keyword matches/);
    // A real local read is the only thing that can say "open".
    expect(competitorGap({ coverageCount: null, adCount: 5 }).basis).toBe("ads");
    expect(competitorGap({ coverageCount: null, adCount: 5 }).score).toBeGreaterThan(0.9);
  });

  it("uses neutral prior when learnings are empty", () => {
    expect(historicalLift([]).score).toBe(0.5);
    const l: Learning = {
      id: "l1", category: "Health & beauty", geo_bucket: "US",
      angle_type: "education", lift: 0.8, sample_size: 10,
      source: "measured" as const,
  updated_at: new Date().toISOString(),
    };
    expect(historicalLift([l]).score).toBeCloseTo(0.8);
  });
});

describe("scoreOpportunity", () => {
  it("produces a 0-10 score with a plain-English rationale", () => {
    const result = scoreOpportunity(
      signal(),
      [service("Facial balancing consult")],
      [],
      { coverageCount: 2 },
    );
    expect(result.score).toBeGreaterThan(5);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.rationale).toContain("facial balancing");
    expect(result.rationale).toContain("you already sell");
    expect(result.matchedService?.name).toBe("Facial balancing consult");
  });

  it("scores a perfect storm near the top of the range", () => {
    const result = scoreOpportunity(
      signal({ delta_pct: 60 }),
      [service("Facial balancing consult and filler")],
      [{
        id: "l1", category: "Health & beauty", geo_bucket: "US",
        angle_type: "education", lift: 0.9, sample_size: 20,
        source: "measured" as const,
  updated_at: new Date().toISOString(),
      }],
      { coverageCount: 0 },
    );
    expect(result.score).toBeGreaterThanOrEqual(8.5);
  });
});

describe("applyRelevance", () => {
  const base = () =>
    scoreOpportunity(signal(), [service("Facial balancing consult")], [], { coverageCount: 2 });

  it("sinks a category-matched but business-irrelevant term", () => {
    const before = base();
    const after = applyRelevance(before, 0.05, "They sell contrast therapy, not teeth whitening.");
    expect(after.score).toBeLessThan(before.score);
    expect(after.components.serviceMatch).toBe(0.05);
    expect(after.matchedService).toBeNull();
    expect(after.rationale).toContain("Snapshot read:");
  });

  it("lifts a relevant term that had no token overlap with any service", () => {
    // "facial balancing" vs a menu that shares no tokens → fallback fit 0.35.
    const before = scoreOpportunity(signal(), [service("Cold plunge session")], [], { coverageCount: 2 });
    expect(before.components.serviceMatch).toBe(0.35);
    const after = applyRelevance(before, 0.95, "Adjacent recovery need their exact customers have.");
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("re-derives the total from the published weights, gated by fit", () => {
    const after = applyRelevance(base(), 0.5, "Plausible stretch.");
    const c = after.components;
    const weighted =
      0.35 * c.normalizedDelta + 0.25 * 0.5 + 0.2 * c.competitorGap + 0.2 * c.historicalLift;
    expect(after.score).toBe(Math.round(weighted * (0.3 + 0.7 * 0.5) * 100) / 10);
  });

  it("momentum weighs the 30-day line, not just this week's delta", () => {
    const climb = Array.from({ length: 30 }, (_, i) => ({ value: 20 + i * 2 }));
    const spike = Array.from({ length: 30 }, (_, i) => ({ value: i === 15 ? 100 : 10 }));
    expect(trendPct(climb)).toBeGreaterThan(50);
    expect(trendPct([{ value: 1 }, { value: 2 }])).toBeNull();
    // A quiet week inside a month-long climb still reads as momentum.
    expect(momentum(4, climb).score).toBeGreaterThan(momentum(4).score);
    // One spike day mid-month does not make a month of flat demand a climb.
    expect(momentum(60, spike).score).toBeLessThan(momentum(60).score);
    // No series: unchanged weekly read, and no month figure to show.
    expect(momentum(25)).toEqual({ score: 0.5, monthPct: null, weekPct: 25 });
    expect(typeof momentum(4, climb).monthPct).toBe("number");
  });

  it("an unmeasured term cannot reach an A on neutral guesses alone", () => {
    // Perfect fit, no ad read, no history — the case that used to score 8.1.
    const evergreen = scoreOpportunity(
      signal({ source: "snapshot", metric_type: "steady_demand", delta_pct: null, term: "bike tune up nyc" }),
      [service("Bike tune up")],
      [],
      { coverageCount: 1 },
      { locality: "state" },
    );
    expect(evergreen.unmeasured).toBe(true);
    expect(evergreen.components.normalizedDelta).toBeLessThan(0.5);
    expect(evergreen.score).toBeLessThan(7);
    expect(evergreen.rationale).toMatch(/no weekly read yet/);
    expect(evergreen.rationale).not.toMatch(/trending in/);
  });

  it("reads this week off the daily series when the signal stored no delta", () => {
    // Two flat weeks then a week up ~50%: measured, not guessed.
    const series = [
      ...Array.from({ length: 16 }, () => ({ value: 20 })),
      ...Array.from({ length: 7 }, () => ({ value: 20 })),
      ...Array.from({ length: 7 }, () => ({ value: 30 })),
    ];
    const read = scoreOpportunity(
      signal({ source: "snapshot", metric_type: "steady_demand", delta_pct: null }),
      [service("Facial balancing consult")],
      [],
      { coverageCount: null },
      { series },
    );
    expect(read.unmeasured).toBe(false);
    expect(read.weekPct).toBeCloseTo(50, 0);
    expect(read.rationale).toMatch(/up 50% search interest this week/);
    expect(weekPctFromSeries(series.slice(0, 10))).toBeNull();
  });

  it("a read below Google's meter is an idea, not an A-grade wave", () => {
    const measured = scoreOpportunity(signal({ delta_pct: null }), [service("Cold plunge session")], [], { coverageCount: 0 });
    const sparse = scoreOpportunity(
      signal({ delta_pct: null, raw: { sparse: true } }),
      [service("Cold plunge session")],
      [],
      { coverageCount: 0 },
    );
    expect(sparse.sparse).toBe(true);
    expect(sparse.components.normalizedDelta).toBeLessThan(measured.components.normalizedDelta);
    expect(sparse.score).toBeLessThan(measured.score);
    expect(sparse.rationale).toContain("too small for Google's meter");
    // The gate survives the relevance pass — a perfect fit can't undo it.
    const judged = applyRelevance(sparse, 1, "Exactly what they sell.");
    expect(judged.score).toBeLessThan(applyRelevance(measured, 1, "Exactly what they sell.").score);
  });

  it("keeps an irrelevant trend in the C range no matter the momentum", () => {
    const hot = scoreOpportunity(signal({ delta_pct: 100 }), [], [], { coverageCount: 0 });
    const after = applyRelevance(hot, 0.05, "Completely outside this business.");
    expect(after.score).toBeLessThan(4.3);
  });
});

describe("dedupeByTerm", () => {
  it("collapses re-phrasings of the same trend, keeping the stronger delta", async () => {
    const { dedupeByTerm } = await import("../lib/recommend/recommend");
    const rows = [
      { normalized_term: "hygiene_routines", delta_pct: 80 },
      { normalized_term: "personal_hygiene_routines", delta_pct: 100 },
      { normalized_term: "korean_glass_skin_facial", delta_pct: 47 },
    ];
    const out = dedupeByTerm(rows);
    expect(out.map((r) => r.normalized_term)).toEqual([
      "personal_hygiene_routines",
      "korean_glass_skin_facial",
    ]);
  });

  it("keeps genuinely different terms apart", async () => {
    const { dedupeByTerm } = await import("../lib/recommend/recommend");
    const rows = [
      { normalized_term: "cold_plunge", delta_pct: 50 },
      { normalized_term: "infrared_sauna", delta_pct: 40 },
    ];
    expect(dedupeByTerm(rows).length).toBe(2);
  });
});

describe("national conversation cannot outrank local demand", () => {
  const local = () =>
    scoreOpportunity(
      signal({ term: "brown sugar oat latte", geo: "US-NC", metric_type: "search_interest", delta_pct: 24 }),
      [],
      [],
      { coverageCount: 0 },
      { locality: "state" },
    );
  const national = () =>
    scoreOpportunity(
      signal({ term: "labor day weekend", geo: "US", metric_type: "conversation", delta_pct: 100 }),
      [],
      [],
      { coverageCount: 0 },
      { locality: "national" },
    );

  it("caps a national board read below the A band however hard it is rising", () => {
    // +100% is the clamp: this is the strongest momentum the scorer can see.
    expect(national().score).toBeLessThan(7);
  });

  it("lets locally measured demand beat it despite weaker momentum", () => {
    expect(local().score).toBeGreaterThan(national().score);
  });

  it("leaves a locally measured conversation read alone", () => {
    const localTalk = scoreOpportunity(
      signal({ geo: "US-NC", metric_type: "conversation", delta_pct: 100 }),
      [],
      [],
      { coverageCount: 0 },
      { locality: "state" },
    );
    expect(localTalk.score).toBeGreaterThan(national().score);
  });
});
