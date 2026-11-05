import { describe, expect, it } from "vitest";

import { calculateOdds, matchSchools, oddsBounds, oddsKey, parseProfile, regularRate, satEquivalent, type Profile } from "@/lib/admitted/odds-core";
import { keptShare, rewriteKey } from "@/lib/admitted/rewrite-core";
import { admitRate, SCHOOLS } from "@/lib/admitted/schools";

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
    expect(rewriteKey("A  draft.", "", 0)).toBe(rewriteKey("A draft.", "", 0));
    expect(rewriteKey("A draft.", "", 0)).not.toBe(rewriteKey("A draft.", "", 1));
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
