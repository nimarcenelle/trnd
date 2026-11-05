import { describe, expect, it } from "vitest";

import { calculateOdds, matchSchools, oddsBounds, oddsKey, parseProfile, regularRate, satEquivalent, type Profile } from "@/lib/admitted/odds-core";
import { segments } from "@/lib/admitted/highlight";
import { buildReview, parseWordLimit, quotedIn, reviewKey, reviewScore, type ReviewReply } from "@/lib/admitted/review-core";
import { keptShare, rewriteKey, rewriteProblems } from "@/lib/admitted/rewrite-core";
import { admitRate, SCHOOLS } from "@/lib/admitted/schools";
import { isSealed, seal, unseal } from "@/lib/admitted/seal";

const dartmouth = SCHOOLS.find((s) => s.id === "dartmouth")!;
const p = (gpa: number, score: number): Profile => ({ gpa, test: { kind: "SAT", score } });

describe("schools", () => {
  it("carries the published rates", () => {
    expect(admitRate(dartmouth).toFixed(1)).toBe("6.0");
    expect(admitRate(SCHOOLS.find((s) => s.id === "stanford")!).toFixed(1)).toBe("3.8");
    expect(new Set(SCHOOLS.map((s) => s.id)).size).toBe(10);
  });
});

describe("input", () => {
  it("reads SAT and ACT by range and rejects the rest", () => {
    expect(parseProfile("3.95", "1530")?.test).toEqual({ kind: "SAT", score: 1530 });
    expect(parseProfile("3.95", "34")?.test).toEqual({ kind: "ACT", score: 34 });
    expect(parseProfile("3.95", "")?.test).toBeNull();
    expect(parseProfile("3.95", "200")).toBeNull();
    expect(parseProfile("9", "1500")).toBeNull();
  });
  it("matches names exactly and sorts out what is not covered", () => {
    const m = matchSchools("upenn, Dartmouth College, dartmouth, Brown, Rice");
    expect(m.found.map((s) => s.id)).toEqual(["penn", "dartmouth"]);
    expect(m.pending).toEqual(["Brown University"]);
    expect(m.unknown).toEqual(["Rice"]);
  });
});

describe("same input, same result", () => {
  it("keys on the inputs alone", () => {
    expect(oddsKey(p(3.95, 1530), dartmouth)).toBe(oddsKey(parseProfile("3.950", " 1530 ")!, dartmouth));
    expect(oddsKey(p(3.95, 1530), dartmouth)).not.toBe(oddsKey(p(3.95, 1540), dartmouth));
    expect(oddsKey(p(3.95, 1530), dartmouth)).not.toBe(oddsKey(p(3.95, 1530), SCHOOLS[0]));
    expect(rewriteKey("A  draft.", "", 650, 0)).toBe(rewriteKey("A draft.", "", 650, 0));
    expect(rewriteKey("A draft.", "", 650, 0)).not.toBe(rewriteKey("A draft.", "", 650, 1));
  });
});

describe("calculated odds", () => {
  const stanford = SCHOOLS.find((s) => s.id === "stanford")!;
  const profiles: Profile[] = [];
  for (const gpa of [3.2, 3.5, 3.7, 3.85, 3.95, 4.0]) for (const score of [1300, 1400, 1480, 1530, 1560, 1600]) profiles.push(p(gpa, score));

  it("is the same every time", () => {
    expect(calculateOdds(p(3.95, 1530), dartmouth)).toEqual(calculateOdds(p(3.95, 1530), dartmouth));
  });
  it("never drops for a stronger profile, at any school", () => {
    for (const s of SCHOOLS)
      for (const a of profiles)
        for (const b of profiles)
          if (a.gpa >= b.gpa && a.test!.score >= b.test!.score) expect(calculateOdds(a, s).odds).toBeGreaterThanOrEqual(calculateOdds(b, s).odds);
  });
  it("moves by small steps for small changes", () => {
    for (const s of SCHOOLS)
      for (let score = 1300; score < 1600; score += 10) {
        const a = calculateOdds(p(3.95, score), s).odds;
        const b = calculateOdds(p(3.95, score + 10), s).odds;
        expect(b - a).toBeLessThanOrEqual(1);
      }
    expect(calculateOdds(p(3.95, 1560), dartmouth).odds - calculateOdds(p(3.95, 1530), dartmouth).odds).toBeLessThanOrEqual(2);
  });
  it("treats an ACT like its SAT equivalent", () => {
    expect(satEquivalent({ kind: "ACT", score: 34 })).toBe(1500);
    expect(calculateOdds({ gpa: 3.95, test: { kind: "ACT", score: 34 } }, dartmouth).odds).toBe(calculateOdds(p(3.95, 1500), dartmouth).odds);
  });
  it("adds up, stays in bounds and offers only the school's own round", () => {
    for (const s of SCHOOLS)
      for (const a of profiles) {
        const r = calculateOdds(a, s);
        expect(r.locked + r.movable).toBe(100);
        expect(r.withFixes).toBe(r.odds + r.fixes.reduce((n, f) => n + f.gain, 0));
        expect(r.withFixes).toBeLessThanOrEqual(oddsBounds(s).cap);
      }
    expect(calculateOdds(p(3.95, 1530), stanford).fixes.map((f) => f.label)).toContain("Apply REA instead of RD");
    expect(calculateOdds(p(3.95, 1530), dartmouth).fixes.map((f) => f.label)).toContain("Apply ED instead of RD");
  });
  it("gives a weak profile lower odds than the published rate", () => {
    expect(calculateOdds(p(3.2, 1300), dartmouth).odds).toBeLessThan(admitRate(dartmouth));
  });
  it("uses the rate outside the early round where it can", () => {
    expect(regularRate(dartmouth)).toBeCloseTo(3.77, 1);
  });
});

describe("essays", () => {
  it("counts sentences kept word for word", () => {
    expect(keptShare("I ran. I fell. I rose.", "I ran. Then I fell hard.")).toBe(50);
  });
});

describe("essay review", () => {
  const essay = "The left boot always comes in worse. I knew this before I knew her name.";
  const grades = { specific: 3, voice: 3, reflection: 3, opening: 3, structure: 3, prompt: 3 };
  const reply = (over: Partial<ReviewReply> = {}): ReviewReply => ({ grades, notes: [], keep: [], ...over });

  it("calculates the score from the grades", () => {
    expect(reviewScore(grades)).toBe(50);
    expect(reviewScore({ ...grades, specific: 1, voice: 1, reflection: 1, opening: 1, structure: 1, prompt: 1 })).toBe(0);
    expect(reviewScore({ ...grades, specific: 5, voice: 5, reflection: 5, opening: 5, structure: 5, prompt: 5 })).toBe(100);
  });

  it("keeps the middle grade, so one odd read does not move the score", () => {
    const review = buildReview(essay, 650, [reply(), reply({ grades: { ...grades, reflection: 5 } }), reply({ grades: { ...grades, opening: 1 } })]);
    expect(review.score).toBe(50);
    expect(buildReview(essay, 650, [reply(), reply({ grades: { ...grades, reflection: 5 } })]).score).toBe(50);
  });

  it("drops notes citing a line that is not in the essay", () => {
    const review = buildReview(essay, 650, [
      reply({
        notes: [
          { quote: "the left  boot always comes in worse.", problem: "p", fix: "f" },
          { quote: "My grandmother taught me everything.", problem: "p", fix: "f" },
          { quote: "", problem: "p", fix: "f" },
        ],
      }),
    ]);
    expect(review.notes.map((n) => n.quote)).toEqual(["the left  boot always comes in worse."]);
  });

  it("matches quotes across curly and straight punctuation", () => {
    expect(quotedIn("I can\u2019t say", "I can't say")).toBe(true);
  });

  it("keeps the same key for the same essay and changes it with any input", () => {
    expect(reviewKey("a  b", "p", 650)).toBe(reviewKey("a b", "p", 650));
    expect(reviewKey("a b", "p", 650)).not.toBe(reviewKey("a b c", "p", 650));
    expect(reviewKey("a b", "p", 650)).not.toBe(reviewKey("a b", "q", 650));
    expect(reviewKey("a b", "p", 650)).not.toBe(reviewKey("a b", "p", 250));
  });

  it("falls back to the Common App limit on a bad word limit", () => {
    expect(parseWordLimit("250")).toBe(250);
    expect(parseWordLimit("")).toBe(650);
    expect(parseWordLimit(5000)).toBe(650);
  });

  it("names what a rewrite must fix before it is shown", () => {
    const rewrite = "My coach cried. I won state.";
    expect(rewriteProblems(rewrite, 6, 650, ["My coach cried."])).toEqual(["Not in the draft: My coach cried."]);
    expect(rewriteProblems(rewrite, 6, 3, [])[0]).toContain("over the 3 word limit");
    expect(rewriteProblems(rewrite, 6, 650, [])).toEqual([]);
    expect(rewriteProblems(rewrite, 200, 650, [])[0]).toContain("too short");
    expect(rewriteProblems(rewrite, 200, 8, [])).toEqual([]);
  });
});

describe("sealed essay results", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("reads back only with the right key, and never holds the text in the clear", () => {
    const sealed = seal({ quote: "The left boot always comes in worse." }, key);
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("boot");
    expect(unseal(sealed, key)).toEqual({ quote: "The left boot always comes in worse." });
    expect(() => unseal(sealed, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(() => seal({}, "short")).toThrow();
  });
});

describe("marking cited lines in a draft", () => {
  const text = "I can\u2019t say. The left boot always comes in worse.\nShe laughed.";
  it("marks each line in place and loses no text", () => {
    const out = segments(text, [{ id: "a", quote: "The left boot always comes in worse." }, { id: "b", quote: "She laughed." }]);
    expect(out.map((s) => s.id)).toEqual([null, "a", null, "b"]);
    expect(out.map((s) => s.text).join("")).toBe(text);
  });
  it("matches across straight and curly punctuation and ignores what it cannot find", () => {
    expect(segments(text, [{ id: "a", quote: "I can't say." }, { id: "c", quote: "Not in here (at all)." }]).filter((s) => s.id).map((s) => s.id)).toEqual(["a"]);
  });
  it("keeps the earlier mark when two lines overlap", () => {
    const out = segments("one two three", [{ id: "a", quote: "one two" }, { id: "b", quote: "two three" }]);
    expect(out.filter((s) => s.id).map((s) => s.id)).toEqual(["a"]);
    expect(out.map((s) => s.text).join("")).toBe("one two three");
  });
});
