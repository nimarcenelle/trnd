import { describe, expect, it } from "vitest";

import { essayVerdict, listVerdict, READY_ESSAY } from "@/lib/admitted/final-core";
import { buildListReview, listKey, numbersKept, type ListReply } from "@/lib/admitted/lists-core";
import { parsePlan, PLANS } from "@/lib/admitted/plans";
import { PROMPTS, wordLimit } from "@/lib/admitted/prompts";
import type { Review } from "@/lib/admitted/review-core";
import { SCHOOLS } from "@/lib/admitted/schools";

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
  it("defaults to the season pass and prices it under monthly", () => {
    expect(parsePlan("nonsense")).toBe("season");
    expect(PLANS.season.cents / PLANS.season.months).toBeLessThan(PLANS.monthly.cents);
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
