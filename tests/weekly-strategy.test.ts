import { describe, expect, it } from "vitest";

import { buildConceptPrompt, type ConceptWriterInput } from "../lib/ai/concept-writer";
import type { Business } from "../lib/db/types";
import { strategyFor } from "../lib/picks/generate";
import type { DossierCoverage } from "../lib/research/dossier";
import type { StrategyRead } from "../lib/research/strategist";
import { readIsStale } from "../lib/research/weekly";

const coverage = (over: Partial<DossierCoverage> = {}): DossierCoverage => ({
  rivalsNamed: 5,
  rivalsDirect: 5,
  rivalsWithAdsRead: 5,
  rivalAdsStored: 15,
  ownPosts: 42,
  rivalPosts: 270,
  ownAdRows: 0,
  ownAdSource: null,
  comments: 0,
  reviews: 0,
  documents: 0,
  termsWithVolume: 55,
  termsWithSeries: 20,
  sources: [],
  missing: [],
  ...over,
});

const angle = (priority: number, title: string, product: string): StrategyRead["angles"][number] => ({
  priority,
  title,
  product,
  the_bet: "Test whether naming the price up front filters the buyer who will pay it.",
  why_now: "Searches for the towel are up this month.",
  differs_from_rivals: "No rival advertises a towel.",
  evidence: ['"microfiber hair towel" · 18,100/mo'],
  risk: "The price may stop the scroll for the wrong reason.",
  format_hint: "Split screen, wet bath towel against the waffle knit.",
});

const read: StrategyRead = {
  situation: "The brand spends on paid social with no results on file. It owns heatless styling. Rivals push scalp health and discounts. The towel is the anchor. Test the core products against cold traffic first.",
  insights: [],
  tensions: ["The brand sells calm; search spikes on urgent problems."],
  whitespace: ["No rival leads with a towel."],
  angles: [angle(1, "The towel math", "The Towel"), angle(2, "Crunch free air dry", "The Smoothing Air Dry Cream")],
  unknowns: ["Ad results are missing."],
  do_not: ["Do not use the phrase holy grail."],
};

describe("the week's read behind the briefs", () => {
  it("is read again only when what was read since would change it", () => {
    expect(readIsStale(null, coverage())).toBe(true);
    expect(readIsStale(coverage(), coverage())).toBe(false);
    expect(readIsStale(coverage({ rivalsWithAdsRead: 0, rivalAdsStored: 0 }), coverage())).toBe(true);
    expect(readIsStale(coverage({ ownPosts: 0 }), coverage())).toBe(true);
    expect(readIsStale(coverage(), coverage({ ownAdRows: 40, ownAdSource: "export" }))).toBe(true);
    expect(readIsStale(coverage(), coverage({ rivalPosts: 280 }))).toBe(false);
    expect(readIsStale(coverage(), coverage({ comments: 30 }))).toBe(true);
  });

  it("hands each concept the angle on its product, never one an earlier concept took", () => {
    const towel = { id: "s1", business_id: "b", name: "The Towel", description: null, price_cents: 5900, is_active: true };
    const first = strategyFor(read, towel, []);
    expect(first?.angle?.title).toBe("The towel math");
    expect(first?.angles).toHaveLength(2);
    const taken = [{ title: "The towel math", hypothesis: "x" }] as unknown as Parameters<typeof strategyFor>[2];
    const second = strategyFor(read, towel, taken);
    expect(second?.angle).toBeNull();
    expect(second?.angles.map((a) => a.title)).toEqual(["Crunch free air dry"]);
    expect(strategyFor(null, towel, [])).toBeNull();
  });

  it("puts the read in the writer's prompt, angle first, with the do-not list", () => {
    const business = { name: "Crown Affair", category: "clean haircare", market: "online", city: "", campaign_objectives: [], production_formats: [] } as unknown as Business;
    const input: ConceptWriterInput = {
      business,
      term: "microfiber hair towel",
      matchedService: null,
      services: [],
      brief: null,
      signals: { targetCustomer: null, rivalLines: [], rivalThemes: [], ownBestTheme: null, ownTopPosts: [], medianDurationSec: null },
      evidence: [],
      quotes: [],
      memory: [],
      otherConcepts: [],
      durationSec: 20,
      strategy: strategyFor(read, { id: "s1", business_id: "b", name: "The Towel", description: null, price_cents: 5900, is_active: true }, []),
    };
    const prompt = buildConceptPrompt(input);
    expect(prompt).toContain("THE ACCOUNT READ THIS WEEK");
    expect(prompt).toContain('THE ANGLE THIS CONCEPT BUILDS: "The towel math" on The Towel.');
    expect(prompt).toContain("Do not use the phrase holy grail.");
    expect(prompt).toContain("No rival leads with a towel.");
    expect(buildConceptPrompt({ ...input, strategy: null })).not.toContain("THE ACCOUNT READ");
  });
});
