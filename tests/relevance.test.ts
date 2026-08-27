import { describe, expect, it } from "vitest";

import type { Service, Signal } from "../lib/db/types";
import {
  buildBusinessFitContext,
  conceptsForText,
  judgeTermRelevance,
} from "../lib/recommend/relevance";
import { applyRelevance, scoreOpportunity } from "../lib/scoring";

const service = (name: string, over: Partial<Service> = {}): Service => ({
  id: `svc-${name}`,
  business_id: "b1",
  name,
  description: null,
  price_cents: 2400,
  is_active: true,
  ...over,
});

const biz = (name: string, category: string, voice: string | null = null) => ({
  name,
  category,
  brand_voice_notes: voice,
});

const bbq = biz("Big Nick's BBQ Shack", "Restaurants & cafés", "Friendly Texas pitmaster. Straight talk.");
const bbqServices = [service("Brisket plate"), service("Family rib pack")];

describe("concept classification", () => {
  it("reads a BBQ menu into the grill concept", () => {
    const concepts = conceptsForText("Brisket plate, family rib pack, smoked wings", "Restaurants & cafés");
    expect(concepts.map((c) => c.key)).toContain("bbq");
  });

  it("reads a cocktail trend into the bar concept, not barbecue", () => {
    const concepts = conceptsForText("espresso martini flights", "Restaurants & cafés");
    const keys = concepts.map((c) => c.key);
    expect(keys).toContain("cocktails");
    expect(keys).not.toContain("bbq");
  });
});

describe("judgeTermRelevance", () => {
  it("gates a cocktail trend for a BBQ smokehouse to mismatch", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);
    const j = judgeTermRelevance("espresso martini flights", "Restaurants & cafés", ctx);
    expect(j.kind).toBe("mismatch");
    expect(j.relevance).toBeLessThan(0.3);
    expect(j.reason).toMatch(/nothing you sell/);
  });

  it("recognizes a direct service hit as the strongest fit", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);
    const j = judgeTermRelevance("family style takeout", "Restaurants & cafés", ctx);
    expect(j.kind).toBe("service");
    expect(j.relevance).toBeGreaterThanOrEqual(0.7);
    expect(j.reason).toContain("Family rib pack");
  });

  it("lets a restaurant WITH a bar ride a cocktail trend", () => {
    const lostIn = biz("Lost In | Restaurant & Bar", "Restaurants & cafés", "Portugal and India on one table. Terrace views.");
    const ctx = buildBusinessFitContext(lostIn, [service("Prawns in Lost In curry sauce"), service("Crispy vegetable samosas")], null);
    const j = judgeTermRelevance("espresso martini flights", "Restaurants & cafés", ctx);
    expect(j.kind).toBe("concept");
    expect(j.relevance).toBeGreaterThanOrEqual(0.6);
  });

  it("treats a mode-only trend as a stretch, not a contradiction", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);
    const j = judgeTermRelevance("late night eats", "Restaurants & cafés", ctx);
    expect(j.kind).toBe("mode");
    expect(j.relevance).toBeCloseTo(0.5);
  });

  it("treats broad category demand as rideable by anyone", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);
    const j = judgeTermRelevance("neighborhood restaurant week", "Restaurants & cafés", ctx);
    expect(j.kind).toBe("general");
    expect(j.relevance).toBeCloseTo(0.55);
  });

  it("stays neutral on unclassifiable terms and thin profiles", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);
    expect(judgeTermRelevance("zorbing weekends", "Restaurants & cafés", ctx).kind).toBe("unknown");

    const thin = buildBusinessFitContext(biz("Untitled", "Restaurants & cafés"), [], null);
    const j = judgeTermRelevance("espresso martini flights", "Restaurants & cafés", thin);
    expect(j.kind).toBe("thin-profile");
    expect(j.relevance).toBeCloseTo(0.45);
  });

  it("uses the founding analysis watchlist as profile signal", () => {
    const ctx = buildBusinessFitContext(
      biz("Glow Room", "Health & beauty"),
      [service("Signature session")],
      { watch_terms: ["hydrafacial", "skin barrier repair"], positioning: "" },
    );
    const j = judgeTermRelevance("korean glass skin facial", "Health & beauty", ctx);
    expect(j.kind).toBe("concept");
    expect(j.relevance).toBeGreaterThanOrEqual(0.6);
  });
});

describe("end-to-end gating through the scorer", () => {
  const signal = (term: string, delta: number): Signal => ({
    id: `s-${term}`,
    source: "seed",
    term,
    normalized_term: term.replace(/\s+/g, "_"),
    category: "Restaurants & cafés",
    geo: "US",
    metric_type: "conversation",
    value: 60,
    delta_pct: delta,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: null,
  });

  it("a hot mismatched trend lands in the C range; a fitting one outranks it", () => {
    const ctx = buildBusinessFitContext(bbq, bbqServices, null);

    const hotMismatch = signal("espresso martini flights", 48);
    const jm = judgeTermRelevance(hotMismatch.term, "Restaurants & cafés", ctx);
    const mismatchScored = applyRelevance(
      scoreOpportunity(hotMismatch, bbqServices, [], { coverageCount: null }),
      jm.relevance,
      jm.reason,
      "Fit read",
    );

    const slowFit = signal("family style takeout", 12);
    const jf = judgeTermRelevance(slowFit.term, "Restaurants & cafés", ctx);
    const fitScored = applyRelevance(
      scoreOpportunity(slowFit, bbqServices, [], { coverageCount: null }),
      jf.relevance,
      jf.reason,
      "Fit read",
    );

    expect(mismatchScored.score).toBeLessThan(4.3); // C range — never the hero
    expect(fitScored.score).toBeGreaterThan(mismatchScored.score);
    expect(fitScored.rationale).toContain("Fit read:");
  });
});
