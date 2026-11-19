import { describe, expect, it } from "vitest";

import { essayVerdict, listVerdict, READY_ESSAY } from "@/lib/essayodds/final-core";
import { buildListReview, listKey, numbersKept, type ListReply } from "@/lib/essayodds/lists-core";
import { accessUntil, parsePlan, PLANS, RD_PASS_ENDS } from "@/lib/essayodds/plans";
import { PROMPTS, wordLimit } from "@/lib/essayodds/prompts";
import type { Review } from "@/lib/essayodds/review-core";
import { SCHOOLS } from "@/lib/essayodds/schools";

const LIST = `President, Robotics Club
Led weekly meetings for 24 members and raised $3,000 for regionals.

Volunteer, Food Bank
Helped out on weekends.`;

const reply = (rewrite: string): ListReply => ({
  entries: [
    { name: "Robotics president", quote: "Led weekly meetings for 24 members and raised $3,000 for regionals.", grades: { a: 4, b: 4, c: 4 }, fix: "Name the result at regionals.", rewrite: "" },
    { name: "Food bank", quote: "Helped out on weekends.", grades: { a: 1, b: 1, c: 3 }, fix: "Say what you did and for how many.", rewrite },
    { name: "Invented", quote: "Founded a nonprofit serving 500 families.", grades: { a: 5, b: 5, c: 5 }, fix: "", rewrite: "" },
  ],
});

describe("activity and honors lists", () => {
  it("drops entries that aren't in the paste and finds the weakest in code", () => {
    const r = buildListReview("activities", LIST, reply("Sorted donations on weekends."));
    expect(r.entries.map((e) => e.name)).toEqual(["Robotics president", "Food bank"]);
    expect(r.weakest).toBe(1);
    expect(r.entries[1].score).toBeLessThan(r.entries[0].score);
  });
  it("throws out a rewrite that adds a number or overruns the field", () => {
    expect(buildListReview("activities", LIST, reply("Sorted 2,000 pounds of food on weekends.")).entries[1].rewrite).toBe("");
    expect(buildListReview("activities", LIST, reply("x".repeat(151))).entries[1].rewrite).toBe("");
    expect(buildListReview("activities", LIST, reply("Sorted donations on weekends.")).entries[1].rewrite).toBe("Sorted donations on weekends.");
    expect(buildListReview("activities", LIST, reply("Helped out on weekends.")).entries[1].rewrite).toBe("");
  });
  it("keeps numbers that were already there", () => {
    expect(numbersKept("raised $3,000 for 24 members", "Raised $3,000 with 24 members.")).toBe(true);
    expect(numbersKept("raised money", "Raised $3,000.")).toBe(false);
  });
  it("keys on the list, so the same paste gets the saved review", () => {
    expect(listKey("activities", LIST)).toBe(listKey("activities", `  ${LIST.replace(/\n/g, "\n\n")}  `));
    expect(listKey("activities", LIST)).not.toBe(listKey("honors", LIST));
  });
});

const review = (score: number, words = 400, limit = 650): Review => ({ score, grades: [], notes: [{ quote: "q", problem: "p", fix: "Open on the moment.", ask: "" }], keep: [], words, limit });

describe("final read", () => {
  it("is ready only at the bar and within the limit", () => {
    expect(essayVerdict(400, review(READY_ESSAY)).status).toBe("ready");
    expect(essayVerdict(400, review(READY_ESSAY - 1))).toEqual({ status: "pass", reason: `Scores ${READY_ESSAY - 1}. Open on the moment.` });
    expect(essayVerdict(700, review(90, 700, 650)).status).toBe("over");
    expect(essayVerdict(10, null).status).toBe("empty");
    expect(essayVerdict(400, null).status).toBe("pass");
  });
  it("names the weakest list entry", () => {
    const r = buildListReview("activities", LIST, reply(""));
    expect(listVerdict(true, r).reason).toContain("Food bank");
    expect(listVerdict(false, null).status).toBe("empty");
  });
});

describe("plans and prompts", () => {
  it("defaults to the RD Pass, which beats buying weeks for anyone with more than three left", () => {
    expect(parsePlan("nonsense")).toBe("rd");
    expect(PLANS.rd.cents).toBeLessThan(PLANS.week.cents * 4);
  });
  it("ends a Week Pass after 7 days and an RD Pass on January 15, never under a week", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(accessUntil("week", now).toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(accessUntil("rd", now)).toEqual(RD_PASS_ENDS);
    expect(accessUntil("rd", new Date("2027-01-14T12:00:00Z")).toISOString()).toBe("2027-01-21T12:00:00.000Z");
  });
  it("has prompts only for schools we cover, each with a source and real text", () => {
    const ids = new Set(SCHOOLS.map((s) => s.id));
    for (const [id, data] of Object.entries(PROMPTS)) {
      expect(ids.has(id)).toBe(true);
      expect(data.source).toMatch(/^https:\/\//);
      for (const p of data.prompts) expect(p.text.trim().length).toBeGreaterThan(5);
    }
  });
  it("turns character limits into word limits", () => {
    expect(wordLimit({ title: "t", text: "t", limit: 600, unit: "characters", required: true })).toBe(100);
    expect(wordLimit({ title: "t", text: "t", limit: 250, unit: "words", required: true })).toBe(250);
  });
});

import { calculateOdds, essayFactor, oddsKey, parseProfile } from "@/lib/essayodds/odds-core";

describe("odds with a read essay", () => {
  const base = parseProfile("3.9", "1500")!;
  it("never drops for a stronger essay, at any school", () => {
    for (const s of SCHOOLS)
      for (let e = 0; e < 100; e += 5) expect(calculateOdds({ ...base, essay: e + 5 }, s).odds).toBeGreaterThanOrEqual(calculateOdds({ ...base, essay: e }, s).odds);
  });
  it("leaves the number alone for an unread essay or a middling one", () => {
    expect(essayFactor(null)).toBe(1);
    expect(essayFactor(50)).toBe(1);
    for (const s of SCHOOLS) expect(calculateOdds({ ...base, essay: 50 }, s).odds).toBe(calculateOdds(base, s).odds);
  });
  it("sizes the essay fix from the draft, and drops it for a draft already at the target", () => {
    const yale = SCHOOLS.find((s) => s.id === "yale")!;
    const weak = calculateOdds({ ...base, essay: 40 }, yale).fixes.find((f) => f.kind === "essays")!.gain;
    const better = calculateOdds({ ...base, essay: 75 }, yale).fixes.find((f) => f.kind === "essays")?.gain ?? 0;
    expect(weak).toBeGreaterThan(better);
    expect(calculateOdds({ ...base, essay: 95 }, yale).fixes.some((f) => f.kind === "essays")).toBe(false);
  });
  it("keeps every saved number without an essay under its old key", () => {
    const s = SCHOOLS[0];
    expect(oddsKey({ ...base, essay: null }, s)).toBe(oddsKey(base, s));
    expect(oddsKey({ ...base, essay: 64 }, s)).not.toBe(oddsKey(base, s));
  });
});

import { cutEssay, fieldsFrom } from "@/lib/essayodds/commonapp-core";

describe("Common App upload", () => {
  const essay = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const pdf = `Personal essay\nSome students have a background...\n${essay.replace(/ word40 /, "\nword40 ")}\nAdditional information\nNone.`;
  it("cuts the essay from the PDF's own text between the two snippets", () => {
    expect(cutEssay(pdf, "word0 word1 word2", "word78 word79")).toBe(essay);
    expect(cutEssay(pdf, "not in the text", "word79")).toBe("");
    expect(cutEssay(pdf, "word0 word1", "word5 word6")).toBe("");
  });
  it("still finds the essay when the model copied a snippet slightly wrong", () => {
    // A dropped word at the end of the opening, a stray word at the start of the closing.
    expect(cutEssay(pdf, "word0 word1 word2 word3 word4 word5 word6 word7 word8 wordX", "wordY word72 word73 word74 word75 word76 word77 word78 word79")).toBe(essay);
  });
  it("keeps only answers that pass the flow's checks", () => {
    const f = fieldsFrom(pdf, { essay_start: "word0 word1", essay_end: "word78 word79", gpa: "3.92", test: "1520", state: "ny", colleges: ["Yale University", "Hogwarts"] });
    expect(f).toEqual({ essay, gpa: "3.92", test: "1520", state: "NY", schools: ["Yale University"] });
    expect(fieldsFrom(pdf, { essay_start: "", essay_end: "", gpa: "about 4", test: "2400", state: "New York", colleges: [] })).toEqual({ essay: "", gpa: "", test: "", state: "", schools: [] });
  });
});

import { daysUntil } from "@/lib/essayodds/deadline";

describe("school deadlines", () => {
  const now = new Date("2026-11-16T17:00:00Z");
  it("counts days to the next one, rolling into next year", () => {
    expect(daysUntil("Jan 2", now)).toBe(47);
    expect(daysUntil("Nov 30", now)).toBe(14);
    expect(daysUntil("Nov 16", now)).toBe(0);
    expect(daysUntil("Nov 1", now)).toBe(350);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("rolling", now)).toBeNull();
  });
});

import { parsePartial } from "@/lib/essayodds/partial-json";

describe("reading a reply while it streams", () => {
  it("shows what has arrived so far", () => {
    expect(parsePartial<{ rewrite: string }>('{"rewrite":"The first bike I fi')).toEqual({ rewrite: "The first bike I fi" });
    expect(parsePartial<{ notes: { fix: string }[] }>('{"grades":{"a":3},"notes":[{"fix":"Open on the mom')).toEqual({ grades: { a: 3 }, notes: [{ fix: "Open on the mom" }] });
    expect(parsePartial('{"notes":[{"fix":"Done"},{"pro')).toEqual({ notes: [{ fix: "Done" }, {}] });
    expect(parsePartial('{"rewrite":"He said \\"hi')).toEqual({ rewrite: 'He said "hi' });
    expect(parsePartial("")).toBeNull();
    expect(parsePartial('{"a":1,"b":[1,2]}')).toEqual({ a: 1, b: [1, 2] });
  });
});

import { cleanSat, parseTarget } from "@/lib/essayodds/sat-core";
import { tierFor } from "@/lib/essayodds/tiers";

describe("Pro", () => {
  it("is a plan of its own that runs as long as the RD Pass, and costs the difference to upgrade", () => {
    expect(parsePlan("pro")).toBe("pro");
    expect(accessUntil("pro", new Date("2026-11-16T12:00:00Z"))).toEqual(RD_PASS_ENDS);
    expect(PLANS.pro.cents - PLANS.rd.cents).toBe(14000);
  });
  it("sorts schools into reach, target and likely", () => {
    expect([tierFor(5), tierFor(24), tierFor(25), tierFor(59), tierFor(60), tierFor(85)]).toEqual(["Reach", "Reach", "Target", "Target", "Likely", "Likely"]);
  });
  it("keeps only real SAT domains, scores in range and three focus skills", () => {
    const plan = cleanSat(
      {
        total: 1340,
        readingWriting: 900,
        math: 650,
        missed: [
          { domain: "Algebra", skill: "Linear equations in two variables", count: 3 },
          { domain: "Vibes", skill: "Made up", count: 9 },
          { domain: "Craft and Structure", skill: "Words in Context", count: 0 },
          { domain: "Advanced Math", skill: "Nonlinear functions", count: 5 },
        ],
        focus: [1, 2, 3, 4].map((i) => ({ skill: `s${i}`, domain: "Algebra", why: "w", drill: "d" })),
        plan: [1, 2, 3, 4].map((week) => ({ week, work: "x" })),
      },
      1500,
    );
    expect([plan.total, plan.readingWriting, plan.math]).toEqual([1340, null, 650]);
    expect(plan.missed.map((m) => m.skill)).toEqual(["Nonlinear functions", "Linear equations in two variables"]);
    expect([plan.focus.length, plan.plan.length, plan.target]).toEqual([3, 3, 1500]);
    expect([parseTarget("1500"), parseTarget("2400"), parseTarget("")]).toEqual([1500, null, null]);
  });
});

import { rdCountdown, rdCountdownLine } from "@/lib/essayodds/deadline";
import { passEndsLabel } from "@/lib/essayodds/plans";

describe("the regular-decision countdown", () => {
  it("counts to January 1, then to January 15, then goes quiet until August", () => {
    expect(rdCountdown(new Date("2026-11-19T15:00:00Z"))).toEqual({ days: 43, what: "most regular-decision deadlines" });
    expect(rdCountdownLine(new Date("2027-01-01T15:00:00Z"))).toBe("Most regular-decision deadlines are today");
    expect(rdCountdownLine(new Date("2027-01-02T15:00:00Z"))).toBe("13 days until the January 15 deadlines");
    expect(rdCountdownLine(new Date("2027-01-14T15:00:00Z"))).toBe("1 day until the January 15 deadlines");
    expect(rdCountdown(new Date("2027-01-16T15:00:00Z"))).toBeNull();
    expect(rdCountdown(new Date("2027-05-01T15:00:00Z"))).toBeNull();
    expect(rdCountdown(new Date("2027-08-01T15:00:00Z"))?.days).toBe(153);
  });

  it("names the last day a pass works, which moves once a week from purchase passes January 15", () => {
    expect(passEndsLabel(new Date("2026-11-19T15:00:00Z"))).toBe("January 15");
    expect(passEndsLabel(new Date("2027-01-08T15:00:00Z"))).toBe("January 15");
    expect(passEndsLabel(new Date("2027-01-12T15:00:00Z"))).toBe("January 19");
    expect(passEndsLabel(new Date("2027-02-01T15:00:00Z"))).toBe("February 8");
  });
});
