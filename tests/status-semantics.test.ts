import { describe, expect, it } from "vitest";

import type { CreativeBrief, PickRun } from "../lib/db/types";
import { conceptStatus, STATUS_LABEL } from "../lib/picks/concept-view";
import { rotateHook } from "../lib/picks/refinements";
import { buildBrandMemory, KILLED_COOLOFF_DAYS, LOST_COOLOFF_DAYS, memoryHold, memoryLines, NOT_NOW_COOLOFF_DAYS } from "../lib/record/memory";
import { runOutcome, STATUS_MEANING } from "../lib/record/outcome";

/**
 * The statuses mean different things and are never collapsed: passed on
 * is not a failure, chosen is not launched, launched is not successful, no
 * result is not a loss, and one stopped execution does not ban the topic.
 */

const now = new Date("2026-09-14T12:00:00Z");
const run = (over: Partial<PickRun> = {}): PickRun => ({
  id: "r1",
  pick_id: "p1",
  business_id: "b1",
  status: "completed",
  started_at: "2026-09-01T00:00:00Z",
  ended_at: "2026-09-06T00:00:00Z",
  spend_usd: null,
  result_note: null,
  meta_campaign_id: null,
  impressions: null,
  clicks: null,
  conversions: null,
  revenue_usd: null,
  ...over,
});

describe("what each status means", () => {
  it("keeps chosen, launched, ended and passed apart", () => {
    expect(conceptStatus({ dismissed: false, run: null })).toBe("proposed");
    expect(conceptStatus({ dismissed: false, run: run({ status: "planned", ended_at: null }) })).toBe("chosen");
    expect(conceptStatus({ dismissed: false, run: run({ status: "running", ended_at: null }) })).toBe("launched");
    expect(conceptStatus({ dismissed: false, run: run({ status: "completed" }) })).toBe("ended");
    expect(conceptStatus({ dismissed: false, run: run({ status: "killed" }) })).toBe("ended");
    // A pass wins over a run that never happened.
    expect(conceptStatus({ dismissed: true, run: null })).toBe("passed");
    expect(STATUS_LABEL.chosen.meaning).toMatch(/Not launched/);
    expect(STATUS_LABEL.launched.meaning).toMatch(/launched is not successful/);
    expect(STATUS_LABEL.passed.meaning).toMatch(/not a performance result/);
    expect(STATUS_MEANING.killed).toMatch(/not a measured loss of the whole angle/);
  });

  it("scores a run only by what was recorded: no numbers is not a loss", () => {
    expect(runOutcome(run({ status: "planned", ended_at: null })).outcome).toBe("open");
    expect(runOutcome(run({ status: "running", ended_at: null })).outcome).toBe("open");
    expect(runOutcome(run({ status: "completed" }))).toMatchObject({ outcome: "unscored", basis: "none" });
    expect(runOutcome(run({ status: "completed", spend_usd: 100, revenue_usd: 250 }))).toMatchObject({ outcome: "won", basis: "roas" });
  });
});

describe("what a past decision does to the next week", () => {
  const memory = () =>
    buildBrandMemory({
      runs: [
        { run: run({ status: "killed", ended_at: "2026-09-02T00:00:00Z" }), pick: { term: "glass skin", concept_title: "The mirror check" } },
        { run: run({ verdict: "lost", ended_at: "2026-08-20T00:00:00Z", learned: "The hook held; the offer did not." }), pick: { term: "brassy hair", concept_title: "Blonde in the wrong light" } },
        { run: run({ status: "killed", ended_at: "2026-08-25T00:00:00Z" }), pick: { term: "old kill" } },
        { run: run({ status: "planned", ended_at: null, started_at: "2026-09-10T00:00:00Z" }), pick: { term: "chosen one", concept_title: "The switch" } },
      ],
      feedback: [
        { feedback: { action: "dismissed", reason: "not_now", created_at: "2026-08-25T00:00:00Z" }, pick: { term: "later" } },
        { feedback: { action: "dismissed", reason: "not_now", created_at: "2026-09-10T00:00:00Z" }, pick: { term: "soon" } },
        { feedback: { action: "chosen", reason: null, created_at: "2026-09-10T00:00:00Z" }, pick: { term: "chosen one" } },
      ],
    });

  it("holds a stopped or lost concept briefly and says the topic comes back", () => {
    expect(KILLED_COOLOFF_DAYS).toBeLessThan(LOST_COOLOFF_DAYS);
    expect(LOST_COOLOFF_DAYS).toBeLessThanOrEqual(21);
    const m = memory();
    expect(memoryHold(m.get("glass_skin"), now)?.reason).toBe('You stopped "The mirror check" on Sep 2; the topic comes back with a different concept');
    // Lost 25 days ago: past the 21-day cool-off, so the topic is back.
    expect(memoryHold(m.get("brassy_hair"), now)).toBeNull();
    // Killed 20 days ago: past the 14-day cool-off.
    expect(memoryHold(m.get("old_kill"), now)).toBeNull();
  });

  it("treats not now as a short pass and chosen as taken", () => {
    const m = memory();
    expect(NOT_NOW_COOLOFF_DAYS).toBeLessThan(28);
    expect(memoryHold(m.get("later"), now)).toBeNull();
    expect(memoryHold(m.get("soon"), now)?.reason).toBe("You said not now (Sep 10)");
    expect(memoryHold(m.get("chosen_one"), now)?.reason).toBe("You chose this for production (Sep 10)");
  });

  it("tells the writer the concept, the outcome and what the owner learned", () => {
    const lines = memoryLines(memory().get("brassy_hair"));
    expect(lines[0]).toBe(
      'The brand ran the concept "Blonde in the wrong light" (from "brassy hair") Sep 1 to Aug 20: it lost (you called it a loss). What they learned: The hook held; the offer did not.',
    );
  });
});

describe("refining by hand", () => {
  const brief: CreativeBrief = {
    version: "ct-1",
    situation: "s",
    hypothesis: "h",
    unknowns: [],
    differs_from: "d",
    format: "f",
    hooks: { primary: "A", alternatives: ["B", "C"] },
    script: { direction: { show: "", say: "", prove: "" }, cta: "", duration_seconds: 20 },
    shot_list: [],
    approved_facts: ["fact"],
    evaluation: { objectives: [], comparison: "", budget: "", watch: [], caveats: [], missing: [] },
    outcomes: { if_better: "", if_same: "", if_worse: "" },
    refined_from: null,
  };

  it("rotates the openings and changes nothing else", () => {
    const next = rotateHook(brief);
    expect(next?.hooks).toEqual({ primary: "B", alternatives: ["C", "A"] });
    expect(next?.approved_facts).toEqual(["fact"]);
    expect(rotateHook({ ...brief, hooks: { primary: "A", alternatives: [] } })).toBeNull();
  });
});
