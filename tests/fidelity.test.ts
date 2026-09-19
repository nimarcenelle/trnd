import { describe, expect, it } from "vitest";

import type { CreativeBrief } from "../lib/db/types";
import { checkFidelity, checkFidelityRules, FIDELITY_FOLLOWED, fidelityLabel, fidelityLine, fidelityScore, RULES_MODEL } from "../lib/picks/fidelity";
import { buildTrackRecord, fidelityLine as recordLine } from "../lib/record/track";
import type { BrandPick, PickRun } from "../lib/db/types";

/**
 * The finished ad against its brief, so a lost test can say whether the
 * idea or the shoot lost. The rules read word overlap on the lines the
 * brief dictates; the model refines them and never overrules a plain no.
 */

const brief: CreativeBrief = {
  version: "ct-2",
  situation: "s",
  hypothesis: "h",
  unknowns: [],
  differs_from: "d",
  format: "20-second talking head",
  hooks: { primary: "That white crust is in the water you wash with", alternatives: ["Look at your showerhead first"] },
  script: { direction: { show: "a", say: "b", prove: "c" }, cta: "Shop the Wall Mount Filtered Showerhead, $68", duration_seconds: 20 },
  opening: {
    beats: [
      { visual: "The scale on the old showerhead in close-up.", on_screen_text: "", vo: "That white crust is in the water you wash with" },
      { visual: "The filter going on by hand.", on_screen_text: "15-stage filter", vo: "Look at what it takes out" },
    ],
  },
  shot_list: ["x", "y"],
  approved_facts: ["Removes chlorine with a 15-stage KDF filter", "Wall Mount Filtered Showerhead, $68"],
  evaluation: { objectives: ["purchases"], comparison: "", budget: "", watch: [], caveats: [], missing: [] },
  outcomes: { if_better: "", if_same: "", if_worse: "" },
  lineage: null,
  refined_from: null,
};

describe("the rules", () => {
  it("passes an ad that opens on the hook, follows the beats and states only approved figures", () => {
    const text = `That white crust is in the water you wash with. [close-up of scale] Look at what it takes out: a 15-stage filter. Shop the Wall Mount Filtered Showerhead, $68.`;
    const c = checkFidelityRules(brief, text);
    expect(c).toMatchObject({ hook_present: true, opening_followed: true, facts_only: true, format_matches: null });
    expect(c.notes).toEqual([]);
    expect(fidelityScore(c)).toBe(1);
    expect(fidelityLabel(fidelityScore(c))).toBe("followed");
  });

  it("fails an ad that replaced the hook, skipped the beats and added a figure", () => {
    const text = `Our best-selling showerhead is 40% off today only! Thousands of five-star reviews. Shop now for $49.`;
    const c = checkFidelityRules(brief, text);
    expect(c).toMatchObject({ hook_present: false, opening_followed: false, facts_only: false });
    expect(c.notes.join(" ")).toMatch(/None of the brief's hooks/);
    expect(c.notes.join(" ")).toMatch(/figures the brief did not approve: 40%, \$49/);
    expect(fidelityScore(c)).toBe(0);
    expect(fidelityLabel(0)).toBe("strayed");
  });

  it("notes an alternative hook, and reads the opening as null on an older brief", () => {
    const text = `Look at your showerhead first. Then look at your hair.`;
    const c = checkFidelityRules({ ...brief, opening: null }, text);
    expect(c.hook_present).toBe(true);
    expect(c.opening_followed).toBeNull();
    expect(c.notes[0]).toMatch(/alternative hooks/);
    expect(fidelityScore({ hook_present: null, opening_followed: null, facts_only: null, format_matches: null })).toBeNull();
    expect(fidelityLabel(null)).toBeNull();
    expect(FIDELITY_FOLLOWED).toBeGreaterThan(0.5);
  });
});

describe("the check with a model", () => {
  it("keeps the model's read but never lets it say yes where the words plainly say no", async () => {
    const text = `Our best-selling showerhead is 40% off today only.`;
    const { read, score } = await checkFidelity(brief, text, "pasted", {
      checker: async () => ({ value: { hook_present: true, opening_followed: true, facts_only: true, format_matches: true, notes: ["all good"] }, model: "gpt-test" }),
      now: new Date("2026-09-19T00:00:00Z"),
    });
    expect(read).toMatchObject({ version: "fidelity-1", hook_present: false, opening_followed: true, facts_only: false, format_matches: true, source: "pasted", model: "gpt-test", checked_at: "2026-09-19T00:00:00.000Z" });
    expect(read.notes).toContain("all good");
    expect(read.notes.some((n) => n.startsWith("The ad carries"))).toBe(true);
    expect(score).toBe(0.5);
    expect(fidelityLine(read, score)).toBe("Strayed from the brief (50%): hook no, opening yes, facts no, format yes.");
  });

  it("stands on the rules when the model fails or is not configured", async () => {
    const text = `That white crust is in the water you wash with. Look at what it takes out.`;
    const failing = await checkFidelity(brief, text, "linked", {
      checker: async () => {
        throw new Error("boom");
      },
    });
    expect(failing.read.model).toBe(RULES_MODEL);
    expect(failing.read.source).toBe("linked");
    expect(failing.score).toBe(1);
    const keyless = await checkFidelity(brief, text, "pasted", { checker: null });
    expect(keyless.read.model).toBe(RULES_MODEL);
  });
});

describe("the record split by fidelity", () => {
  const pick = (id: string): BrandPick => ({ id, business_id: "b", opportunity_id: null, week_of: "2026-09-14", rank: 1, geo: "US", term: id, finding: "", metric_label: "", metric_value: null, metric_delta_pct: null, metric_window: "week", sparkline: [], bet_what: "", bet_budget_usd: 0, bet_duration_days: 0, bet_kill_rule: "", guardrail: null, grade: "A", status: "ready", created_at: "" }) as BrandPick;
  const run = (id: string, verdict: "won" | "lost" | null, fidelity: number | null): PickRun =>
    ({ id, pick_id: id, business_id: "b", status: "completed", started_at: `2026-09-0${id.length}T00:00:00Z`, ended_at: "2026-09-10T00:00:00Z", spend_usd: 100, result_note: null, verdict, fidelity_score: fidelity, meta_campaign_id: null }) as PickRun;

  it("counts followed, strayed and unchecked apart and says what the split shows", () => {
    const record = buildTrackRecord([
      { run: run("a", "won", 1), pick: pick("a") },
      { run: run("bb", "won", 0.75), pick: pick("bb") },
      { run: run("ccc", "lost", 0.25), pick: pick("ccc") },
      { run: run("dddd", "lost", null), pick: pick("dddd") },
    ]);
    expect(record.byFidelity).toEqual({ followed: { runs: 2, scored: 2, won: 2 }, strayed: { runs: 1, scored: 1, won: 0 }, unchecked: 1 });
    expect(recordLine(record)).toBe("Tests that followed the brief won 2 of 2; tests that strayed won 0 of 1. The briefs hold up where they were followed; the losses sit with the shoots that strayed.");
    expect(record.rows[0].fidelity).toBeNull();
  });

  it("says nothing until a side is scored, and names the briefs when strays win", () => {
    expect(recordLine(buildTrackRecord([{ run: { ...run("a", null, 1), status: "running" }, pick: pick("a") }]))).toBeNull();
    const strays = buildTrackRecord([
      { run: run("a", "lost", 0.9), pick: pick("a") },
      { run: run("bb", "won", 0.1), pick: pick("bb") },
    ]);
    expect(recordLine(strays)).toMatch(/the briefs are the problem/);
    expect(recordLine(buildTrackRecord([{ run: run("a", "won", 0.9), pick: pick("a") }]))).toBe("Tests that followed the brief won 1 of 1. No scored test has strayed from its brief yet.");
  });
});
