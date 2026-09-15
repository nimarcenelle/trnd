import { describe, expect, it } from "vitest";

import { assembleBrief, claimNumbers, conceptsOverlap, distinctConcepts, factSupported, validateConceptWrite, type ConceptRules } from "../lib/picks/concept";
import { buildEvaluationPlan, conceptBasis, structuralUnknowns } from "../lib/picks/evaluation";
import type { AdHistory } from "../lib/db/types";

/**
 * The rules that separate evidence from judgment. A concept is stored only
 * when every fact it states traces to something on file; its judgments are
 * stored as written and labeled on the page.
 */

const rules: ConceptRules = {
  term: "hard water",
  corpus: [
    "Wall Mount Filtered Showerhead",
    "Wall Mount Filtered Showerhead $68.00",
    "Removes chlorine and reduces heavy metals with a 15-stage KDF filter",
    'Searches for "hard water" are rising across the US.',
    "Your 3 past ads on this ran about even with your account average.",
  ],
  allowedPriceCents: [6800],
  forbiddenPhrases: ["cures eczema"],
};

const good = () => ({
  title: "The crust on the showerhead",
  situation: "Someone notices white scale on the showerhead and wonders what it is doing to their hair. They have blamed the shampoo twice already.",
  hypothesis: "Test whether opening on the visible scale is more persuasive than opening on the filter, because the search phrase suggests people name the problem before the product.",
  unknowns: ["Whether the brand has a real bathroom to shoot in."],
  differs_from: "Recent ads opened on the product on a white background; this opens on the problem in a real bathroom.",
  format: "20-second talking head",
  hooks: { primary: "That white crust is in the water you wash with", alternatives: ["I blamed my shampoo for a year", "Look at your showerhead first"] },
  script: {
    direction: {
      show: "A real bathroom, the scale on the old showerhead in close-up, then the filter going on by hand in one shot.",
      say: "Name the problem the way the customer does, then say plainly what the filter removes, as the product page states it.",
      prove: "What the filter removes, as the product page states it: chlorine. No results promised.",
    },
    cta: "Shop the Wall Mount Filtered Showerhead, $68",
    duration_seconds: 20,
  },
  shot_list: ["Close on the scale, thumb wiping it.", "The filter twisting on, hands only.", "Water running clear through the new head."],
  approved_facts: ["The Wall Mount Filtered Showerhead is listed at $68.", "The filter removes chlorine and reduces heavy metals."],
  outcomes: {
    if_better: "The problem-first opening works for this audience; test a second visible symptom next.",
    if_same: "The opening did not decide it; test the alternative hooks before changing the concept.",
    if_worse: "They want the product first; open on the filter in use next time.",
  },
  priority_reason: "Searches on this are rising and nothing on file shows an ad from you that opens on the visible problem.",
  guardrail: null,
});

const errorOf = (draft: unknown, r: ConceptRules = rules) => {
  const v = validateConceptWrite(draft, r);
  return v.ok ? "" : v.error;
};

describe("a creative test the writer returns", () => {
  it("passes when every fact it states is on file", () => {
    const v = validateConceptWrite(good(), rules);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.hooks.alternatives).toHaveLength(2);
      expect(v.value.approved_facts).toHaveLength(2);
    }
  });

  it("fails a fact that nothing on file supports", () => {
    const d = good();
    d.approved_facts.push("Backed by a 30-day money-back guarantee.");
    expect(errorOf(d)).toMatch(/approved_facts\.2: "Backed by a 30-day money-back guarantee\." is not on the product pages/);
  });

  it("fails an invented percentage anywhere in the judgment text", () => {
    const d = good();
    d.hypothesis = "Test whether this lifts response by 40%, because the scale is visible.";
    expect(errorOf(d)).toMatch(/hypothesis: states 40% which nothing on file supports/);
  });

  it("lets a figure through only when the corpus carries it", () => {
    const d = good();
    d.script.direction.prove = "The 15-stage filter, as the product page states it.";
    expect(errorOf(d)).toBe("");
    d.script.direction.prove = "The 12-stage filter, as the product page states it.";
    expect(errorOf(d)).toBe("");
    d.script.direction.prove = "Filters 99 contaminants, as the product page states it.";
    expect(errorOf(d)).toMatch(/states the figure 99/);
  });

  it("fails a hook that opens on a price or a figure", () => {
    const d = good();
    d.hooks.primary = "Sixty eight dollars to fix hard water for good";
    expect(errorOf(d)).toMatch(/hooks\.primary: a hook carries no price/);
    const e = good();
    e.hooks.alternatives[0] = "Save 20% on the filter this week";
    expect(errorOf(e)).toMatch(/hooks\.alternatives\.0: a hook carries no price/);
  });

  it("fails a price the catalog does not list", () => {
    const d = good();
    d.script.cta = "Shop the filter, $59";
    expect(errorOf(d)).toMatch(/script\.cta: names \$59, which is not a listed price/);
  });

  it("fails a hypothesis written as a certainty and a line that promises a result", () => {
    const d = good();
    d.hypothesis = "Opening on the scale will always beat opening on the filter, because the problem is visible.";
    expect(errorOf(d)).toMatch(/hypothesis: written as a certainty/);
    const e = good();
    e.outcomes.if_better = "This concept is proven; it will double conversion rate next week.";
    expect(errorOf(e)).toMatch(/outcomes\.if_better: promises a result/);
  });

  it("fails a phrase the owner said never to use, wherever it lands", () => {
    const d = good();
    d.approved_facts[1] = "The filter cures eczema and reduces heavy metals.";
    expect(errorOf(d)).toMatch(/approved_facts\.1: uses "cures eczema"/);
  });

  it("fails a title that repeats the research term instead of naming a concept", () => {
    const d = good();
    d.title = "Hard water";
    expect(errorOf(d)).toMatch(/title: the title must name a creative concept/);
  });

  it("names every problem once so the retry can fix them all", () => {
    const d = good();
    d.hooks.primary = "Only $68 today";
    d.approved_facts = ["Dermatologist recommended."];
    const err = errorOf(d);
    expect(err).toMatch(/hooks\.primary/);
    expect(err).toMatch(/approved_facts\.0/);
  });
});

describe("what counts as a supported fact", () => {
  it("traces a restated fact to the corpus and refuses one with a foreign number", () => {
    expect(factSupported("The showerhead filters chlorine with a 15-stage KDF filter.", rules.corpus)).toBe(true);
    expect(factSupported("The showerhead filters chlorine with a 12-stage KDF filter.", rules.corpus)).toBe(true);
    expect(factSupported("The showerhead filters chlorine with a 15-stage filter tested on 500 homes.", rules.corpus)).toBe(false);
    expect(factSupported("Free shipping on every order.", rules.corpus)).toBe(false);
  });

  it("reads percentages, dollars and large figures apart from small counts", () => {
    expect(claimNumbers("Two shots, 3 seconds each, 40% off, $68, tested on 1,200 people")).toEqual({
      percents: [40],
      dollars: [68],
      numbers: [1200],
    });
  });
});

describe("two concepts that say the same thing", () => {
  it("are one concept, and the later one is dropped", () => {
    const a = good();
    const b = { ...good(), title: "The scale on the showerhead", hooks: { primary: "See the crust on your showerhead first", alternatives: [] } };
    expect(conceptsOverlap(a, b)).toBe(true);
    const c = {
      ...good(),
      title: "One take, start to finish",
      situation: "Someone expects installing anything in a shower to need a plumber and a Saturday.",
      hypothesis: "Test whether one unbroken shot of the install is more persuasive than an edited sequence, because effort is the doubt and cuts hide effort.",
      hooks: { primary: "No cuts. This is the whole install", alternatives: [] },
    };
    expect(conceptsOverlap(a, c)).toBe(false);
    const { kept, dropped } = distinctConcepts([a, b, c]);
    expect(kept.map((k) => k.title)).toEqual([a.title, c.title]);
    expect(dropped.map((k) => k.title)).toEqual([b.title]);
  });

  it("treats the same primary hook as the same concept whatever the words around it", () => {
    const a = good();
    const b = { ...good(), title: "Something else entirely", situation: "A different situation with other words in it, about towels.", hypothesis: "Test whether towels beat sponges, because absorbency is the doubt." };
    expect(conceptsOverlap(a, b)).toBe(true);
  });
});

const historyRow = (i: number, over: Partial<AdHistory> = {}): AdHistory => ({
  id: `h${i}`,
  business_id: "b1",
  platform: "meta",
  campaign_name: `Test ${i}`,
  ad_name: `Ad ${i}`,
  copy: null,
  impressions: 20000,
  clicks: 300,
  spend_cents: 60000,
  results: 15,
  ctr: null,
  started_on: "2026-08-01",
  ended_on: "2026-08-20",
  source: "meta_export",
  created_at: "2026-08-21T00:00:00Z",
  ...over,
});

describe("the evaluation plan", () => {
  it("names what is missing instead of inventing a threshold", () => {
    const plan = buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: null, campaign_objective: null, category: "Skincare" }, history: [], format: "talking head" });
    expect(plan.objective).toBeNull();
    expect(plan.missing).toHaveLength(3);
    expect(plan.missing.join(" ")).toMatch(/objective/);
    expect(plan.missing.join(" ")).toMatch(/export/);
    expect(plan.missing.join(" ")).toMatch(/spend/);
    expect(plan.watch.join(" ")).not.toMatch(/\d(\.\d+)?%\s+(after|at|by)/);
    expect(plan.watch.join(" ")).not.toMatch(/\bkill\b/i);
    expect(plan.caveats.join(" ")).toMatch(/directional/);
  });

  it("uses the account's own baseline and dates when an export is on file", () => {
    const history = [1, 2, 3].map((i) => historyRow(i));
    const plan = buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: "20-50k", campaign_objective: "purchases", category: "Skincare" }, history, format: "talking head" });
    expect(plan.watch[0]).toBe("Cost per purchase against your account's $40 (from your export, Aug 1, 2026 to Aug 20, 2026).");
    expect(plan.comparison).toContain('"Ad 1"');
    expect(plan.budget).toMatch(/\$1,000 to \$2,000 over one week/);
    expect(plan.missing).toEqual([]);
    expect(plan.watch.join(" ")).toMatch(/1\.50%/);
  });

  it("does not let click-through alone call a purchase test, and says so", () => {
    const plan = buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: "20-50k", campaign_objective: "purchases", category: "Skincare" }, history: [], format: "static" });
    expect(plan.watch.find((w) => /click-through/i.test(w))).toMatch(/not a win for a purchase campaign/);
    expect(plan.caveats.join(" ")).toMatch(/report late/);
  });

  it("reads awareness on attention and warns off purchase numbers", () => {
    const plan = buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: "20-50k", campaign_objective: "awareness", category: "Skincare" }, history: [], format: "static" });
    expect(plan.watch[0]).toMatch(/hook rate/i);
    expect(plan.caveats.join(" ")).toMatch(/not purchases/);
  });

  it("says when an export carries no results column", () => {
    const history = [1, 2].map((i) => historyRow(i, { results: null }));
    const plan = buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: "20-50k", campaign_objective: "purchases", category: "Skincare" }, history, format: "static" });
    expect(plan.caveats.join(" ")).toMatch(/no results column/);
  });
});

describe("builds on or explores", () => {
  it("builds on a past run, a loss included, without banning the topic", () => {
    const lost = { term: "hard water", normalized: "hard_water", runs: [{ status: "completed" as const, outcome: "lost" as const, reason: "ROAS 0.8x", startedAt: "2026-08-01", endedAt: "2026-08-10", title: "The crust", learned: null }], dismissals: [] };
    expect(conceptBasis({ memory: lost, historyOnTerm: 0, ownBestTheme: false })).toMatchObject({ basis: "builds_on" });
    expect(conceptBasis({ memory: lost, historyOnTerm: 0, ownBestTheme: false }).reason).toMatch(/angle changes; the topic stays/);
    expect(conceptBasis({ memory: undefined, historyOnTerm: 0, ownBestTheme: false })).toMatchObject({ basis: "explores" });
  });

  it("adds the structural gaps to the brief's unknowns without repeating the writer's", () => {
    const gaps = structuralUnknowns({ history: [], hasRecentCreative: false, hasClaimsNotes: false, rivalAdsRead: 0, commentsRead: 6 });
    expect(gaps).toHaveLength(5);
    const brief = assembleBrief(
      { ...good(), unknowns: ["No ad results on file, so nothing is checked against what worked for you."], differs_from: null },
      { evaluation: buildEvaluationPlan({ business: { market: "online", monthly_ad_spend: null, campaign_objective: null, category: "x" }, history: [], format: "x" }), structuralUnknowns: gaps, differsFallback: "No recent creative on file." },
    );
    expect(brief.unknowns.filter((u) => /ad results on file/.test(u))).toHaveLength(1);
    expect(brief.differs_from).toBe("No recent creative on file.");
  });
});
