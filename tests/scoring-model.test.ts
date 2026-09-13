import { describe, expect, it } from "vitest";

import {
  combineSignals,
  gradeForScore,
  NEUTRAL_PLACEHOLDER,
  percentileRank,
  signalScore,
  weightedComponents,
  type SignalName,
  type SignalScore,
} from "../lib/scoring/model";

const sig = (signal: SignalName, score: number, confidence: SignalScore["confidence"] = "high", note: string | null = null): SignalScore => ({
  signal,
  score,
  confidence,
  components: [],
  note,
  cta: null,
});

describe("grade bands", () => {
  it("maps scores to the founder's bands", () => {
    expect(gradeForScore(95).letter).toBe("A+");
    expect(gradeForScore(90).letter).toBe("A+");
    expect(gradeForScore(89.9).letter).toBe("A");
    expect(gradeForScore(72).letter).toBe("B+");
    expect(gradeForScore(60).letter).toBe("B");
    expect(gradeForScore(55).letter).toBe("C");
    expect(gradeForScore(49.9)).toEqual({ letter: "Hold", meaning: "Don't build a campaign yet", hold: true });
  });
});

describe("relative scoring", () => {
  it("ranks a reading against its baseline, and refuses a thin one", () => {
    const baseline = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentileRank(100, baseline)).toBe(95);
    expect(percentileRank(5, baseline)).toBe(0);
    expect(percentileRank(55, baseline)).toBe(50);
    expect(percentileRank(55, [10, 20, 30])).toBeNull();
  });

  it("spreads a missing component's weight over the ones with data", () => {
    expect(
      weightedComponents([
        { key: "a", label: "A", weight: 40, score: 80 },
        { key: "b", label: "B", weight: 35, score: null },
        { key: "c", label: "C", weight: 25, score: 40 },
      ]),
    ).toBeCloseTo((40 * 80 + 25 * 40) / 65, 1);
    expect(weightedComponents([{ key: "a", label: "A", weight: 40, score: null }])).toBeNull();
  });

  it("never lets a signal with no computed components look credible", () => {
    const s = signalScore("brand", [{ key: "a", label: "A", weight: 40, score: null }], "high");
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
  });
});

describe("the Opportunity Grade", () => {
  it("uses 35/25/20/20 when every signal has medium or better confidence", () => {
    const g = combineSignals({
      customer: sig("customer", 90),
      brand: sig("brand", 80),
      culture: sig("culture", 70, "medium"),
      competitive: sig("competitive", 60),
    });
    expect(g.score).toBe(Math.round(((35 * 90 + 25 * 80 + 20 * 70 + 20 * 60) / 100) * 10) / 10);
    // 35×90 + 25×80 + 20×70 + 20×60 = 77.5: a B+.
    expect(g.score).toBe(77.5);
    expect(g.grade).toBe("B+");
    expect(g.excluded).toEqual([]);
    expect(g.notes).toEqual([]);
  });

  it("redistributes a low-confidence signal's weight and says so, instead of dragging the grade down", () => {
    const g = combineSignals({
      customer: sig("customer", 90),
      brand: sig("brand", 80),
      culture: sig("culture", 70),
      competitive: sig("competitive", NEUTRAL_PLACEHOLDER, "low", "No competitors connected yet"),
    });
    expect(g.excluded).toEqual(["competitive"]);
    expect(g.weightsUsed.competitive).toBe(0);
    expect(g.weightsUsed.customer).toBeCloseTo(43.8, 1);
    expect(g.score).toBeCloseTo((35 * 90 + 25 * 80 + 20 * 70) / 80, 1);
    expect(g.notes).toEqual(["Competitive wasn't factored in: no competitors connected yet."]);
  });

  it("holds when nothing has enough data to grade", () => {
    const low = (s: SignalName) => sig(s, NEUTRAL_PLACEHOLDER, "low");
    const g = combineSignals({ customer: low("customer"), brand: low("brand"), culture: low("culture"), competitive: low("competitive") });
    expect(g.hold).toBe(true);
    expect(g.grade).toBe("Hold");
  });
});
