import { describe, expect, it } from "vitest";

import { historyLineage } from "../lib/ads/history-read";
import type { AdHistory, CreativeBrief } from "../lib/db/types";
import { assembleBrief, type ConceptWrite } from "../lib/picks/concept";
import { buildConceptView, conceptToText } from "../lib/picks/concept-view";

/**
 * The concept graded against the brand's own record: its last ads of the
 * same shape, and how many beat the account. Written by code from the
 * numbers; null when there is nothing of the brand's own to read.
 */

let n = 0;
const ad = (over: Partial<AdHistory>): AdHistory =>
  ({
    id: `h${++n}`,
    business_id: "b",
    platform: "meta",
    campaign_name: "Prospecting",
    ad_name: null,
    copy: null,
    impressions: 10000,
    clicks: 100,
    spend_cents: null,
    results: null,
    ctr: null,
    started_on: "2026-06-01",
    ended_on: null,
    source: "meta_export",
    created_at: "",
    ...over,
  }) as AdHistory;

describe("historyLineage", () => {
  const rows = [
    // Explaining ads: two above the account's 1%, one under, one too thin to count, one older than the last three.
    ad({ copy: "Why your hair feels like straw after every shower", impressions: 20000, clicks: 300, started_on: "2026-09-01" }),
    ad({ copy: "How to tell if hard water is wrecking your color", impressions: 20000, clicks: 260, started_on: "2026-08-20" }),
    ad({ copy: "The truth about shower filters", impressions: 20000, clicks: 120, started_on: "2026-08-01" }),
    ad({ copy: "Did you know chlorine fades blonde", impressions: 200, clicks: 20, started_on: "2026-08-25" }),
    ad({ copy: "What is in your tap water", impressions: 20000, clicks: 400, started_on: "2026-05-01" }),
    // Offers, which pull the account average down.
    ad({ copy: "20% off this weekend only", impressions: 100000, clicks: 700, started_on: "2026-07-01" }),
  ];

  it("names the last three ads of the concept's shape and how many beat the account", () => {
    const lineage = historyLineage(rows, "The crust on the showerhead. Why your hair feels like straw. We think naming the cause may lift response.");
    expect(lineage).toEqual({
      theme: "education",
      ads: 3,
      beat: 2,
      line: "2 of your last 3 ads built on explaining something beat your account click-through.",
      latest: "2026-09-01",
    });
  });

  it("reads one ad in the singular and says when it ran under", () => {
    const one = [ad({ copy: "Why your hair feels like straw", impressions: 20000, clicks: 100 }), ad({ copy: "$5 off", impressions: 100000, clicks: 2000 })];
    expect(historyLineage(one, "Why does this keep happening")?.line).toBe("Your last ad built on explaining something ran under your account click-through.");
  });

  it("is null without an account average, without an ad of that shape, or without concept words", () => {
    expect(historyLineage([], "why")).toBeNull();
    expect(historyLineage(rows, "   ")).toBeNull();
    // No speed ads on file: a same-day concept has no lineage to read.
    expect(historyLineage(rows, "Same day delivery, open now")).toBeNull();
  });
});

const write: ConceptWrite = {
  title: "The crust on the showerhead",
  situation: "Someone whose hair changed when they moved and cannot say why.",
  hypothesis: "We think naming the cause before the product may lift response because it matches the search.",
  unknowns: [],
  differs_from: null,
  format: "20-second talking head",
  hooks: { primary: "Your shower is why your hair feels like straw", alternatives: [] },
  script: { direction: { show: "A real bathroom, the old showerhead on the wall.", say: "Name the problem the way the customer does.", prove: "What the filter removes, as the page states it." }, cta: "Shop the filter", duration_seconds: 20 },
  shot_list: ["The showerhead", "The filter going on"],
  approved_facts: ["Removes chlorine"],
  outcomes: { if_better: "Problem-first wins here.", if_same: "The opening did not matter.", if_worse: "Lead with the product." },
  priority_reason: "The search is rising and nobody runs the angle.",
  guardrail: null,
};
const evaluation: CreativeBrief["evaluation"] = { objectives: [], comparison: "Beside your best.", budget: "$500", watch: [], caveats: [], missing: [] };

describe("the lineage on the brief", () => {
  it("is stored on the brief, shown on the page and in the copied text, and absent without history", () => {
    const lineage = { theme: "education", ads: 3, beat: 2, line: "2 of your last 3 ads built on explaining something beat your account click-through.", latest: "2026-09-01" };
    const brief = assembleBrief(write, { evaluation, structuralUnknowns: [], differsFallback: "n/a", lineage });
    expect(brief.lineage).toEqual(lineage);
    const pick = { id: "p1", business_id: "b", term: "hard water", concept_title: write.title, brief, guardrail: null, rank: 1 } as never;
    const view = buildConceptView({ pick, evidence: [], scripts: [], run: null, dismissed: false });
    expect(view?.lineage).toEqual(lineage);
    expect(view?.copyAll).toContain("YOUR OWN RECORD ON THIS SHAPE\n2 of your last 3 ads");
    expect(conceptToText({ ...view!, lineage: null })).not.toContain("YOUR OWN RECORD");

    const bare = assembleBrief(write, { evaluation, structuralUnknowns: [], differsFallback: "n/a" });
    expect(bare.lineage).toBeNull();
  });
});
