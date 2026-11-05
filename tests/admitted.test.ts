import { describe, expect, it } from "vitest";

import { calculateOdds, matchSchools, oddsBounds, oddsKey, parseProfile, regularRate, satEquivalent, type Profile } from "@/lib/admitted/odds-core";
import { segments } from "@/lib/admitted/highlight";
import { scoreKind, STATES, validGpa } from "@/lib/admitted/flow";
import { schoolQuery, shortName } from "@/lib/admitted/list";
import { parseEmail } from "@/lib/admitted/leads";
import { parseSchoolRequest } from "@/lib/admitted/school-request";
import { buildReview, maxNotes, parseWordLimit, quotedIn, reviewKey, reviewScore, type ReviewReply } from "@/lib/admitted/review-core";
import { answersText, bestAttempt, keptShare, parseAnswers, rewriteKey, rewriteProblems } from "@/lib/admitted/rewrite-core";
import { APPLICANTS, FACTORS } from "@/components/admitted/sample";
import { admitRate, SCHOOLS } from "@/lib/admitted/schools";
import { isSealed, seal, unseal } from "@/lib/admitted/seal";

const dartmouth = SCHOOLS.find((s) => s.id === "dartmouth")!;
const p = (gpa: number, score: number): Profile => ({ gpa, test: { kind: "SAT", score } });

describe("schools", () => {
  it("carries the published rates", () => {
    expect(admitRate(dartmouth).toFixed(1)).toBe("6.0");
    expect(admitRate(SCHOOLS.find((s) => s.id === "stanford")!).toFixed(1)).toBe("3.8");
    expect(new Set(SCHOOLS.map((s) => s.id)).size).toBe(29);
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
        // Schools admitting a third of applicants have larger numbers, so steps scale with them.
        expect(b - a).toBeLessThanOrEqual(Math.max(admitRate(s) >= 25 ? 2 : 1, Math.ceil(a * 0.08)));
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

  it("averages the reads, so one odd read moves the score by a little", () => {
    const review = buildReview(essay, 650, [reply(), reply(), reply({ grades: { ...grades, reflection: 4 } })]);
    expect(review.score).toBe(51);
    expect(review.grades.find((g) => g.id === "reflection")?.grade).toBe(3);
    expect(buildReview(essay, 650, [reply({ grades: { ...grades, opening: 2 } }), reply({ grades: { ...grades, opening: 4 } })]).score).toBe(50);
  });

  it("drops notes citing a line that is not in the essay", () => {
    const review = buildReview(essay, 650, [
      reply({
        notes: [
          { quote: "the left  boot always comes in worse.", problem: "p", fix: "f", ask: "" },
          { quote: "My grandmother taught me everything.", problem: "p", fix: "f", ask: "" },
          { quote: "", problem: "p", fix: "f", ask: "" },
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
    expect(rewriteProblems(rewrite, 6, 650, ["My coach cried."])).toEqual(["Not in the draft or the student's details: My coach cried."]);
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

describe("a list of schools", () => {
  it("shortens school names", () => {
    expect(SCHOOLS.map((s) => shortName(s.name))).toEqual(expect.arrayContaining(["Harvard", "Dartmouth", "Penn", "UChicago"]));
    expect(shortName("MIT")).toBe("MIT");
  });
});

describe("choosing between two rewrites", () => {
  const a = (name: string, after: number, flagged: string[] = []) => ({ name, after, flagged });
  it("keeps the higher score, and the first on a tie", () => {
    expect(bestAttempt([a("first", 50), a("second", 60)]).name).toBe("second");
    expect(bestAttempt([a("first", 60), a("second", 50)]).name).toBe("first");
    expect(bestAttempt([a("first", 50), a("second", 50)]).name).toBe("first");
  });
  it("never trades an invented line for a higher score", () => {
    expect(bestAttempt([a("first", 50), a("second", 80, ["My coach cried."])]).name).toBe("first");
    expect(bestAttempt([a("first", 80, ["My coach cried."]), a("second", 50)]).name).toBe("second");
  });
});

describe("details a student adds", () => {
  it("keeps only real answers, within limits", () => {
    expect(parseAnswers("nope")).toEqual([]);
    expect(parseAnswers([{ ask: "Say what she said", answer: "  " }, null, { ask: "What failed?", answer: " The bearing " }])).toEqual([{ ask: "What failed?", answer: "The bearing" }]);
    expect(parseAnswers(Array.from({ length: 9 }, () => ({ ask: "a", answer: "b" })))).toHaveLength(6);
    expect(parseAnswers([{ ask: "a", answer: "x".repeat(5000) }])[0].answer).toHaveLength(1500);
  });
  it("gives a different saved rewrite for different details", () => {
    const one = [{ ask: "a", answer: "b" }];
    expect(rewriteKey("d", "", 650, 0, one)).not.toBe(rewriteKey("d", "", 650, 0));
    expect(rewriteKey("d", "", 650, 0, one)).toBe(rewriteKey("d", "", 650, 0, [{ ask: "a", answer: "b" }]));
    expect(answersText(one)).toBe("a\nb");
  });
  it("marks fewer lines on a short draft", () => {
    expect(maxNotes(60)).toBe(2);
    expect(maxNotes(136)).toBe(3);
    expect(maxNotes(650)).toBe(6);
  });
});

describe("schools without an early round or test scores", () => {
  const ucla = SCHOOLS.find((s) => s.id === "ucla")!;
  it("offers no round fix at UCLA and ignores the score there", () => {
    const low = calculateOdds(p(3.7, 1100), ucla);
    expect(low.odds).toBe(calculateOdds(p(3.7, 1590), ucla).odds);
    expect(low.fixes.some((f) => f.label.startsWith("Apply"))).toBe(false);
  });
});

describe("a school request", () => {
  it("needs a school and a real-looking email", () => {
    expect(parseSchoolRequest(" Ohio  State ", " Me@Example.com ")).toEqual({ school: "Ohio State", email: "me@example.com" });
    expect(parseSchoolRequest("", "me@example.com")).toBeNull();
    expect(parseSchoolRequest("Ohio State", "nope")).toBeNull();
  });
});

describe("the public samples", () => {
  it("put no number on essays, letters or activities", () => {
    for (const f of FACTORS.movable) expect(f.kind === "round" ? f.gain : undefined).toBe(f.kind === "round" ? 6 : undefined);
    expect(FACTORS.movable.filter((f) => "gain" in f).map((f) => f.kind)).toEqual(["round"]);
  });
  it("match the calculation", () => {
    for (const a of APPLICANTS)
      for (const row of a.schools) {
        const school = SCHOOLS.find((s) => s.name === row.name)!;
        const live = calculateOdds(parseProfile(a.gpa, a.test.replace("SAT ", ""), a.home)!, school);
        expect([live.odds, live.withFixes, live.locked, live.movable]).toEqual([row.odds, row.withFixes, row.locked, row.movable]);
      }
  });
});

describe("the school picker", () => {
  it("reaches every school through the odds route, all at once", () => {
    const { found, pending, unknown } = matchSchools(SCHOOLS.map((s) => schoolQuery(s.name)).join(", "));
    expect(found.map((s) => s.id).sort()).toEqual(SCHOOLS.map((s) => s.id).sort());
    expect([pending, unknown]).toEqual([[], []]);
  });
  it("never shows odds above 85, with or without fixes", () => {
    for (const s of SCHOOLS) {
      const best = calculateOdds(p(4.0, 1600), s);
      expect(best.odds).toBeLessThanOrEqual(85);
      expect(best.withFixes).toBeLessThanOrEqual(85);
    }
  });
  it("has figures that add up", () => {
    for (const s of SCHOOLS) {
      expect(s.admitted).toBeLessThan(s.applicants);
      if (s.sat25 !== null) expect(s.sat25).toBeLessThan(s.sat75!);
      if (s.early?.admitted) expect(s.early.admitted).toBeLessThan(s.early.applicants!);
    }
  });
  it("has no alias shared by two schools", () => {
    const aliases = SCHOOLS.flatMap((s) => s.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("home state", () => {
  const unc = SCHOOLS.find((s) => s.id === "unc")!;
  const yale = SCHOOLS.find((s) => s.id === "yale")!;
  const at = (home: string | null, s = unc) => calculateOdds({ gpa: 3.9, test: { kind: "SAT", score: 1450 }, home }, s).odds;
  it("moves the number at a public school with a split", () => {
    expect(at("NC")).toBeGreaterThan(at(null));
    expect(at("GA")).toBeLessThan(at(null));
    expect(at("INTL")).toBeLessThan(at("NC"));
  });
  it("does nothing at a school without one, and keeps its saved result", () => {
    expect(at("NC", yale)).toBe(at(null, yale));
    expect(oddsKey({ gpa: 3.9, test: null, home: "NC" }, yale)).toBe(oddsKey({ gpa: 3.9, test: null }, yale));
    expect(oddsKey({ gpa: 3.9, test: null, home: "NC" }, unc)).not.toBe(oddsKey({ gpa: 3.9, test: null, home: "GA" }, unc));
    expect(oddsKey({ gpa: 3.9, test: null, home: "GA" }, unc)).toBe(oddsKey({ gpa: 3.9, test: null, home: "TX" }, unc));
  });
  it("reads a home from the request, and refuses nonsense", () => {
    expect(parseProfile("3.9", "1450", "nc")?.home).toBe("NC");
    expect(parseProfile("3.9", "1450", "INTL")?.home).toBe("INTL");
    expect(parseProfile("3.9", "1450", "North Carolina")).toBeNull();
    expect(STATES).toHaveLength(52);
  });
  it("has residency figures close to each school's totals", () => {
    for (const s of SCHOOLS) {
      if (!s.residency) continue;
      const r = s.residency;
      expect(Math.abs(r.inState[0] + r.outOfState[0] + r.international[0] - s.applicants)).toBeLessThanOrEqual(s.applicants * 0.11);
      expect(Math.abs(r.inState[1] + r.outOfState[1] + r.international[1] - s.admitted)).toBeLessThanOrEqual(s.admitted * 0.11);
    }
  });
});

describe("flow inputs", () => {
  it("checks a GPA and names the test", () => {
    expect(validGpa("3.7")).toBe(true);
    expect(validGpa("")).toBe(false);
    expect(validGpa("9")).toBe(false);
    expect(scoreKind("1350")).toBe("SAT");
    expect(scoreKind("29")).toBe("ACT");
    expect(scoreKind("")).toBe("");
    expect(scoreKind("200")).toBeNull();
  });
});

describe("the guide email", () => {
  it("takes a real-looking address", () => {
    expect(parseEmail(" Me@Example.com ")).toBe("me@example.com");
    expect(parseEmail("nope")).toBeNull();
    expect(parseEmail("")).toBeNull();
  });
});
