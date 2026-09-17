import { describe, expect, it } from "vitest";

import type { AdHistory, BrandPick, PickRun } from "../lib/db/types";
import { calibrationReport, runLift } from "../lib/record/calibration";
import { calibrationLine, buildTrackRecord, liftsForGrade } from "../lib/record/track";

/**
 * Predicted against actual: the lift a run logs when it ends, and the
 * per-grade report that says whether the stamp has ordered results here.
 */

let n = 0;
const pick = (grade: string | null, grade_score: number | null = null): BrandPick =>
  ({ id: `p${++n}`, business_id: "b", term: "t", grade, grade_score, bet_duration_days: 5 }) as unknown as BrandPick;
const run = (over: Partial<PickRun>): PickRun =>
  ({
    id: `r${++n}`,
    pick_id: "",
    business_id: "b",
    status: "completed",
    started_at: "2026-09-01T00:00:00Z",
    ended_at: "2026-09-06T00:00:00Z",
    spend_usd: 500,
    result_note: null,
    meta_campaign_id: null,
    ...over,
  }) as PickRun;
const history = (over: Partial<AdHistory>): AdHistory =>
  ({
    id: `h${++n}`,
    business_id: "b",
    platform: "meta",
    campaign_name: "Prospecting",
    ad_name: null,
    copy: null,
    impressions: 100000,
    clicks: 1000,
    spend_cents: null,
    results: null,
    ctr: null,
    started_on: "2026-06-01",
    ended_on: null,
    source: "meta_export",
    created_at: "",
    ...over,
  }) as AdHistory;

describe("runLift", () => {
  it("is the run's click-through over the account's, with the run's own row left out", () => {
    const rows = [history({}), history({ campaign_name: "TRND pick: t", impressions: 1000, clicks: 100 })];
    expect(runLift({ impressions: 9000, clicks: 180 }, rows, "TRND pick: t")).toEqual({ baselineCtr: 0.01, lift: 2 });
    // Counted in, the run's own 10% would pull the baseline up to 1.1%.
    expect(runLift({ impressions: 9000, clicks: 180 }, rows).baselineCtr).toBe(0.011);
  });

  it("logs nothing without a baseline or without delivery", () => {
    expect(runLift({ impressions: 9000, clicks: 180 }, [])).toEqual({ baselineCtr: null, lift: null });
    expect(runLift({ impressions: null, clicks: 180 }, [history({})])).toEqual({ baselineCtr: 0.01, lift: null });
  });
});

describe("calibrationReport", () => {
  it("reads predicted beside actual per grade and says whether the order held", () => {
    const report = calibrationReport([
      { run: run({ verdict: "won", lift: 1.4 }), pick: pick("A", 82) },
      { run: run({ verdict: "won", lift: 1.2 }), pick: pick("A", 78) },
      { run: run({ verdict: "won", lift: 1.1 }), pick: pick("B", 61) },
      { run: run({ verdict: "lost", lift: 0.7 }), pick: pick("B", 59) },
      { run: run({ status: "running", ended_at: null }), pick: pick("A", 80) },
    ]);
    expect(report.scored).toBe(4);
    expect(report.grades).toEqual([
      { letter: "A", runs: 3, scored: 2, won: 2, predicted: 80, hitRate: 1, medianLift: 1.3, lifts: 2 },
      { letter: "B", runs: 2, scored: 2, won: 1, predicted: 60, hitRate: 0.5, medianLift: 0.9, lifts: 2 },
    ]);
    expect(report.ordered).toBe(true);
    expect(report.line).toBe("Across 4 scored tests, A picks won 2 of 2, B picks won 1 of 2. So far the higher grade has won more often, which is what the stamp claims.");
  });

  it("says so when a lower grade beat a higher one", () => {
    const report = calibrationReport([
      { run: run({ verdict: "lost" }), pick: pick("A") },
      { run: run({ verdict: "lost" }), pick: pick("A") },
      { run: run({ verdict: "won" }), pick: pick("B") },
      { run: run({ verdict: "won" }), pick: pick("B") },
    ]);
    expect(report.ordered).toBe(false);
    expect(report.line).toMatch(/a lower grade has beaten a higher one/);
  });

  it("withholds a verdict on the order until two grades have two finished tests each", () => {
    const report = calibrationReport([{ run: run({ verdict: "won", lift: 1.5 }), pick: pick("A") }]);
    expect(report.ordered).toBeNull();
    expect(report.line).toBe("Across 1 scored test, A picks won 1 of 1. The stamp can be checked against results once two grades have two finished tests each.");
    expect(calibrationReport([]).line).toBeNull();
  });
});

describe("the grade card's line carries the lift once runs log one", () => {
  it("appends the median lift and nothing without one", () => {
    const runs = [
      { run: run({ verdict: "won", lift: 1.5 }), pick: pick("B+") },
      { run: run({ verdict: "lost", lift: 0.8 }), pick: pick("B+") },
      { run: run({ verdict: "won" }), pick: pick("A") },
    ];
    const record = buildTrackRecord(runs);
    expect(liftsForGrade(runs, "B+")).toEqual([1.5, 0.8]);
    expect(calibrationLine(record, "B+", liftsForGrade(runs, "B+"))).toBe("B+ picks have won 1 of 2 for you so far. Their click-through ran 1.15x your account average (median of 2).");
    expect(calibrationLine(record, "A", liftsForGrade(runs, "A"))).toBe("A picks have won 1 of 1 for you so far.");
  });
});
