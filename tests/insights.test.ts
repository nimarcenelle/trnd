import { describe, expect, it } from "vitest";

import {
  buildInsights,
  buildNextAction,
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
  { id: "l1", category: "Health & beauty", geo_bucket: "US", angle_type: "education", lift: 0.72, sample_size: 14, updated_at: "" },
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

  it("action names the launch window and stays one sentence of detail", () => {
    const a = buildNextAction({ hasCampaign: false, launchBy: "Aug 27", priceBand: "$$" });
    expect(a.detail).toContain("Aug 27");
    expect(a.detail).toContain("$25–50");
  });

  it("results takeaway is one line, never a paragraph", () => {
    const t = buildResultsTakeaway({ avgCtr: 0.025, benchmark: 0.018, roas: 6.9 });
    expect(t).toBeTruthy();
    expect(t!).not.toContain("\n");
    expect(t!).toMatch(/scale the winner/);
    expect(buildResultsTakeaway({ avgCtr: null, benchmark: 0.018, roas: null })).toBeNull();
  });
});
