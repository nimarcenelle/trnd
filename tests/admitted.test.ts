import { describe, expect, it } from "vitest";

import { compareProfiles, keepDirection, matchSchools, oddsBounds, oddsKey, parseProfile, tidyOdds, type Profile } from "@/lib/admitted/odds-core";
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

describe("limits on the model", () => {
  it("clamps odds and makes the numbers add up", () => {
    const { cap, floor } = oddsBounds(dartmouth);
    expect(tidyOdds(dartmouth, { odds: 99, locked: 60, fixes: [] }).odds).toBe(cap);
    expect(tidyOdds(dartmouth, { odds: 0, locked: 60, fixes: [] }).odds).toBe(floor);
    const t = tidyOdds(dartmouth, { odds: 9, locked: 61, fixes: [{ label: "A", gain: 1 }, { label: "B", gain: 7 }] });
    expect(t.fixes[0].label).toBe("B");
    expect(t.withFixes).toBe(17);
    expect(t.locked + t.movable).toBe(100);
  });
  it("never lets a stronger profile show lower odds", () => {
    const prior = tidyOdds(dartmouth, { odds: 12, locked: 60, fixes: [] });
    const lower = tidyOdds(dartmouth, { odds: 10, locked: 60, fixes: [] });
    expect(keepDirection(lower, prior, compareProfiles(p(3.95, 1550), p(3.95, 1530))).odds).toBe(12);
    expect(keepDirection(prior, lower, compareProfiles(p(3.9, 1500), p(3.95, 1530))).odds).toBe(10);
    expect(compareProfiles(p(4, 1500), p(3.9, 1530))).toBeNull();
  });
});

describe("essays", () => {
  it("counts sentences kept word for word", () => {
    expect(keptShare("I ran. I fell. I rose.", "I ran. Then I fell hard.")).toBe(50);
  });
});
