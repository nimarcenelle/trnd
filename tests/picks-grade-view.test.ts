import { describe, expect, it } from "vitest";

import { gradeLabel, gradeTone, readGrade } from "../lib/picks/grade-view";
import { GRADE_BANDS, combineSignals, signalScore, type SignalName, type SignalScore } from "../lib/scoring/model";

const comp = (key: string, score: number | null, detail?: string) => ({ key, label: key[0].toUpperCase() + key.slice(1), weight: 30, score, detail });

const signals = (): Record<SignalName, SignalScore> => ({
  customer: signalScore("customer", [comp("volume", 90, "40,500 searches this week"), comp("intent", 70)], "high"),
  culture: signalScore("culture", [comp("growth", 80)], "medium"),
  competitive: signalScore("competitive", [], "low", {
    note: "No competitors connected yet",
    cta: { label: "Connect competitors", href: "/app/settings#competitors" },
  }),
  brand: signalScore("brand", [comp("similarity", 60)], "medium"),
});

/** What the ranking job stores: the four scores by name plus weights, excluded and notes. */
function stored() {
  const g = combineSignals(signals());
  const { signals: s, weightsUsed, excluded, notes } = g;
  return {
    grade: g.grade,
    grade_score: g.score,
    signal_scores: JSON.parse(JSON.stringify({ ...s, weightsUsed, excluded, notes })) as Record<string, unknown>,
  };
}

describe("readGrade", () => {
  it("is null for a pick written before the grade", () => {
    expect(readGrade(null)).toBeNull();
    expect(readGrade({})).toBeNull();
    expect(readGrade({ grade: null, grade_score: null, signal_scores: null })).toBeNull();
    // The column default.
    expect(readGrade({ grade: null, grade_score: null, signal_scores: {} })).toBeNull();
  });

  it("reads a stored grade: letter, meaning from the bands, rounded score", () => {
    const view = readGrade(stored());
    expect(view).not.toBeNull();
    const band = GRADE_BANDS.find((b) => b.letter === view?.letter);
    expect(view?.meaning).toBe(band?.meaning);
    expect(view?.score).toBe(Math.round(stored().grade_score));
  });

  it("uses a valid stored letter, else derives it from the score, else gives up", () => {
    expect(readGrade({ grade: "A", grade_score: 20 })?.meaning).toBe("Strong, clear go");
    expect(readGrade({ grade: "Z", grade_score: 84 })?.letter).toBe("A");
    expect(readGrade({ grade: "Z", grade_score: "91.5" as unknown as number })?.letter).toBe("A+");
    expect(readGrade({ grade: "Z", grade_score: null })).toBeNull();
    expect(readGrade({ grade: 7 as unknown as string, grade_score: "abc" as unknown as number })).toBeNull();
    expect(readGrade({ grade: "B", grade_score: Number.NaN })).toMatchObject({ letter: "B", score: null });
    expect(readGrade({ grade: "Hold" })?.meaning).toBe("Don't build a campaign yet");
  });

  it("never throws on malformed jsonb and drops only the broken pieces", () => {
    for (const junk of ["oops", 42, [], [1, 2], true]) {
      const view = readGrade({ grade: "B+", grade_score: 72, signal_scores: junk as unknown as Record<string, unknown> });
      expect(view).toMatchObject({ letter: "B+", signals: [], excludedNotes: [] });
    }
    const view = readGrade({
      grade: "B",
      grade_score: 64,
      signal_scores: {
        customer: { score: 70, confidence: "certain" }, // unknown confidence
        culture: { score: "n/a", confidence: "high" }, // no number
        competitive: null,
        brand: {
          score: 66,
          confidence: "medium",
          components: [null, "x", { label: "" }, { key: "similarity", label: "Similarity", score: "abc", detail: 5 }],
          note: 12,
          cta: { label: "Import ads", href: "javascript:alert(1)" },
        },
        notes: ["", "  ", 3, "Culture wasn't factored in."],
      },
    });
    expect(view?.signals.map((s) => s.name)).toEqual(["brand"]);
    expect(view?.signals[0]).toEqual({
      name: "brand",
      label: "Brand",
      score: 66,
      confidence: "medium",
      note: null,
      cta: null,
      components: [{ key: "similarity", label: "Similarity", score: null, detail: null }],
    });
    expect(view?.excludedNotes).toEqual(["Culture wasn't factored in."]);
  });

  it("orders the signals Customer, Culture, Competitive, Brand whatever the key order", () => {
    const blob = stored().signal_scores;
    const shuffled = { brand: blob.brand, notes: blob.notes, competitive: blob.competitive, culture: blob.culture, customer: blob.customer };
    expect(readGrade({ ...stored(), signal_scores: shuffled })?.signals.map((s) => s.label)).toEqual([
      "Customer",
      "Culture",
      "Competitive",
      "Brand",
    ]);
  });

  it("also reads a whole OpportunityGrade nested under `signals`", () => {
    const g = JSON.parse(JSON.stringify(combineSignals(signals())));
    expect(readGrade({ grade: g.grade, grade_score: g.score, signal_scores: g })?.signals).toHaveLength(4);
  });

  it("gives a low-confidence signal its note and fix link, never its placeholder number", () => {
    const competitive = readGrade(stored())?.signals.find((s) => s.name === "competitive");
    expect(competitive).toMatchObject({
      confidence: "low",
      score: null,
      note: "No competitors connected yet",
      cta: { label: "Connect competitors", href: "/app/settings#competitors" },
    });
    const external = readGrade({
      grade: "B",
      signal_scores: { brand: { score: 50, confidence: "low", note: "No ad history yet", cta: { label: "Connect Meta", href: "https://business.facebook.com/" } } },
    });
    expect(external?.signals[0].cta?.href).toBe("https://business.facebook.com/");
    const protocolRelative = readGrade({
      grade: "B",
      signal_scores: { brand: { score: 50, confidence: "low", cta: { label: "x", href: "//evil.example" } } },
    });
    expect(protocolRelative?.signals[0].cta).toBeNull();
  });

  it("keeps components with their scores and details", () => {
    const customer = readGrade(stored())?.signals[0];
    expect(customer?.components).toEqual([
      { key: "volume", label: "Volume", score: 90, detail: "40,500 searches this week" },
      { key: "intent", label: "Intent", score: 70, detail: null },
    ]);
  });

  it("reads the excluded notes, or rebuilds them from `excluded` when notes are missing", () => {
    expect(readGrade(stored())?.excludedNotes).toEqual(["Competitive wasn't factored in: no competitors connected yet."]);
    const { notes: _notes, ...rest } = stored().signal_scores;
    void _notes;
    expect(readGrade({ ...stored(), signal_scores: rest })?.excludedNotes).toEqual([
      "Competitive wasn't factored in: no competitors connected yet.",
    ]);
    expect(readGrade({ grade: "A", signal_scores: { excluded: ["brand", "nope"] } })?.excludedNotes).toEqual([
      "Brand wasn't factored in.",
    ]);
  });
});

describe("grade label and tone", () => {
  it("says the letter and its meaning", () => {
    expect(gradeLabel({ letter: "A", meaning: "Strong, clear go" })).toBe("A · Strong, clear go");
  });

  it("tones A as a go, B as a look, C and Hold as quiet", () => {
    expect(["A+", "A", "B+", "B", "C", "Hold"].map((l) => gradeTone(l as never))).toEqual([
      "mint",
      "mint",
      "amber",
      "amber",
      "faint",
      "faint",
    ]);
  });
});
