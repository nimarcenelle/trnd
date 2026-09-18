import { describe, expect, it } from "vitest";

import { buildCandidatePool, evergreenSignalInputs, spreadTopTerms } from "../lib/recommend/recommend";
import { buildInsights } from "../lib/recommend/insights";
import { applyRelevance, type ScoredOpportunity } from "../lib/scoring";
import type { Business, Signal } from "../lib/db/types";

const entry = (id: string, term: string) => ({ signal: { id, term } });

/** Enough high-momentum junk terms to fill the raw cutoff (pool size 20). */
const junkPool = Array.from({ length: 20 }, (_, i) => entry(`junk-${i}`, `skin barrier trend ${i}`));

describe("buildCandidatePool", () => {
  it("admits a snapshot watch-term signal ranked past the cutoff", () => {
    const allScored = [...junkPool, entry("hit", "cold plunge memberships")];
    const pool = buildCandidatePool(allScored, ["cold plunge near me", "sauna benefits"]);
    expect(pool.map((e) => e.signal.id)).toContain("hit");
    // The union preserves best-first order — extras append after the cutoff.
    expect(pool[pool.length - 1].signal.id).toBe("hit");
  });

  it("matches against menu item names too", () => {
    const allScored = [...junkPool, entry("hit", "contrast therapy recovery")];
    const pool = buildCandidatePool(allScored, ["Contrast Therapy Session"]);
    expect(pool.map((e) => e.signal.id)).toContain("hit");
  });

  it("does not admit unrelated terms and stays at the cutoff without anchors", () => {
    const allScored = [...junkPool, entry("miss", "teeth whitening deals")];
    expect(
      buildCandidatePool(allScored, ["cold plunge near me"]).map((e) => e.signal.id),
    ).not.toContain("miss");
    expect(buildCandidatePool(allScored, [])).toHaveLength(20);
  });

  it("caps the number of admitted extras", () => {
    const extras = Array.from({ length: 12 }, (_, i) => entry(`extra-${i}`, `cold plunge angle ${i}`));
    const pool = buildCandidatePool([...junkPool, ...extras], ["cold plunge"]);
    expect(pool.length).toBeLessThanOrEqual(20 + 8);
  });

  it("refuses a single shared generic token — 'back' alone buys no seat", () => {
    const allScored = [...junkPool, entry("miss", "back acne treatments")];
    const pool = buildCandidatePool(allScored, ["back pain relief natural"]);
    expect(pool.map((e) => e.signal.id)).not.toContain("miss");
  });

  it("seats exact watch-term matches before higher-scored near matches", () => {
    // Near matches outrank the exact one on raw score (earlier in the list),
    // but the business's own term must never lose its seat to them.
    const near = Array.from({ length: 8 }, (_, i) => entry(`near-${i}`, `infrared sauna deal ${i}`));
    const allScored = [...junkPool, ...near, entry("own", "infrared sauna near me")];
    const pool = buildCandidatePool(allScored, ["infrared sauna near me"]);
    expect(pool.map((e) => e.signal.id)).toContain("own");
  });
});

describe("evergreenSignalInputs", () => {
  const business = {
    id: "b1",
    category: "Health & beauty",
    region: "NC",
    city: "Chapel Hill",
  } as unknown as Business;
  const watchTerms = ["cold plunge chapel hill", "infrared sauna near me", "ice bath near me"];

  it("turns snapshot watch terms into steady-demand candidates", () => {
    const rows = evergreenSignalInputs(business, watchTerms, []);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      source: "snapshot",
      metric_type: "steady_demand",
      category: "Health & beauty",
      geo: "US-NC",
      delta_pct: null,
    });
  });

  it("skips terms already present as a scorable trend read, but not ones only present as coverage", () => {
    const rows = evergreenSignalInputs(business, watchTerms, [
      { normalized_term: "cold_plunge_chapel_hill", metric_type: "search_interest" },
      { normalized_term: "infrared_sauna_near_me", metric_type: "news_coverage" },
    ]);
    const terms = rows.map((r) => r.term);
    expect(terms).not.toContain("cold plunge chapel hill");
    expect(terms).toContain("infrared sauna near me");
  });
});

describe("buildInsights for an evergreen pick", () => {
  it("frames steady demand honestly instead of a fake trend spike", () => {
    const signal = {
      id: "s2",
      source: "snapshot",
      term: "cold plunge chapel hill",
      metric_type: "steady_demand",
      delta_pct: null,
    } as unknown as Signal;
    const scored: ScoredOpportunity = {
      score: 6.8,
      components: { normalizedDelta: 0.5, serviceMatch: 1, competitorGap: 0.7, historicalLift: 0.5 },
      matchedService: null,
      rationale: "",
      competitorGapText: "",
      localityBonus: 0,
    };
    const insights = buildInsights(signal, { ...scored, unmeasured: true, weekPct: null }, { learnings: [] });
    const momentum = insights.find((i) => i.kind === "momentum")!;
    expect(momentum.headline).toBe("Year-round demand, no weekly read yet");
    expect(momentum.detail).toMatch(/sure play, not a measured wave/);
    // With a measured week, the headline carries the number.
    const measured = buildInsights(signal, { ...scored, weekPct: -11, monthPct: 48 }, { learnings: [] });
    expect(measured.find((i) => i.kind === "momentum")!.headline).toBe("Year-round demand · ↓11% this week");
    expect(measured.find((i) => i.kind === "momentum")!.detail).toMatch(/up 48%/);
    // No ad read: the gap line says unknown, never "competitors haven't moved".
    const unknown = buildInsights(signal, { ...scored, competitorBasis: "none", components: { ...scored.components, competitorGap: 0.55 } }, { learnings: [] });
    expect(unknown.find((i) => i.kind === "gap")!.headline).toBe("Competition not measured yet");
  });
});

describe("applyRelevance round-trip for the breakdown", () => {
  it("re-applying the persisted relevance reproduces the stored score", () => {
    const raw: ScoredOpportunity = {
      score: 6.6,
      components: { normalizedDelta: 1, serviceMatch: 0.35, competitorGap: 0.6, historicalLift: 0.5 },
      matchedService: null,
      rationale: "base",
      competitorGapText: "",
      localityBonus: 0,
    };
    const stored = applyRelevance(raw, 0.1, "wrong business");
    const reExplained = applyRelevance(raw, 0.1, "wrong business");
    expect(reExplained.score).toBe(stored.score);
    expect(reExplained.components.serviceMatch).toBe(0.1);
  });
});

describe("buildInsights on a judged-thin week", () => {
  const signal = {
    id: "s1",
    term: "personal hygiene routines",
    metric_type: "conversation",
    delta_pct: 100,
  } as unknown as Signal;
  const scored: ScoredOpportunity = {
    score: 3.1,
    components: { normalizedDelta: 1, serviceMatch: 0.05, competitorGap: 0.6, historicalLift: 0.5 },
    matchedService: null,
    rationale: "",
    competitorGapText: "",
    localityBonus: 0,
  };

  it("replaces the new-offer pitch with the honest fit read", () => {
    const insights = buildInsights(signal, scored, {
      learnings: [],
      unfit: true,
      snapshotReason: "A contrast-therapy studio has no credible skincare offer.",
    });
    const fit = insights.find((i) => i.kind === "fit")!;
    expect(fit.headline).toBe("Doesn't map to what you sell");
    expect(fit.detail).toContain("contrast-therapy");
    expect(insights.some((i) => i.headline === "New offer opportunity")).toBe(false);
  });

  it("calls a hard mismatch outside the lane even on a normal week", () => {
    // serviceMatch 0.05 is a fit-gate survivor, not an opportunity — the
    // honest read is "outside your lane", never a dressed-up offer pitch.
    const insights = buildInsights(signal, scored, { learnings: [] });
    expect(insights.some((i) => i.headline === "Outside what you sell")).toBe(true);
    expect(insights.some((i) => i.headline === "New offer opportunity")).toBe(false);
  });

  it("pitches a new offer only when fit is plausible without a menu match", () => {
    const plausible: ScoredOpportunity = {
      ...scored,
      components: { ...scored.components, serviceMatch: 0.5 },
    };
    const insights = buildInsights(signal, plausible, { learnings: [] });
    expect(insights.some((i) => i.headline === "New offer opportunity")).toBe(true);
  });
});

describe("spreadTopTerms", () => {
  const t = (normalized_term: string) => ({ signal: { normalized_term } });

  it("keeps a fifth phrasing of one product from taking a seat while other themes wait", () => {
    const sorted = [
      t("hard_water_softener"),
      t("filter_with_shower_head"),
      t("shower_purifier_filter"),
      t("shower_water_filter"),
      t("filtered_showerhead"),
      t("sudden_adult_acne"),
      t("my_hair_feels_like_straw"),
    ];
    expect(spreadTopTerms(sorted, 5).map((e) => e.signal.normalized_term)).toEqual([
      "hard_water_softener",
      "filter_with_shower_head",
      "sudden_adult_acne",
      "my_hair_feels_like_straw",
      "shower_purifier_filter",
    ]);
  });

  it("fills the seats from the deferred terms when nothing else is left", () => {
    const sorted = [t("shower_filter"), t("shower_head_filter"), t("filtered_shower_head"), t("best_shower_filter")];
    expect(spreadTopTerms(sorted, 3).map((e) => e.signal.normalized_term)).toEqual(["shower_filter", "shower_head_filter", "filtered_shower_head"]);
  });

  it("is a plain best-first cut when the themes already differ", () => {
    const sorted = [t("girl_math"), t("eczema_flare_up"), t("hard_water")];
    expect(spreadTopTerms(sorted, 2).map((e) => e.signal.normalized_term)).toEqual(["girl_math", "eczema_flare_up"]);
  });
});
