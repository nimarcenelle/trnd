import { describe, expect, it } from "vitest";

import type { BrandPick, PickRun } from "../lib/db/types";
import { buildTrackRecord, calibrationLine, hitRateLine, ratePct } from "../lib/record/track";

let n = 0;
const pick = (term: string, grade: string | null): BrandPick =>
  ({ id: `p${++n}`, business_id: "b", term, grade, bet_duration_days: 5 }) as unknown as BrandPick;
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

describe("buildTrackRecord", () => {
  it("counts won over scored, never over run", () => {
    const record = buildTrackRecord([
      { run: run({ verdict: "won", ended_at: "2026-09-06T00:00:00Z" }), pick: pick("hard water", "B+") },
      { run: run({ status: "killed", ended_at: "2026-09-10T00:00:00Z" }), pick: pick("glass skin", "C") },
      { run: run({ verdict: "won", ended_at: "2026-09-12T00:00:00Z" }), pick: pick("brassy hair", "B+") },
      { run: run({}), pick: pick("everything shower", "B") }, // completed, no numbers: unscored
      { run: run({ status: "running", ended_at: null }), pick: pick("shower filter", "A") },
    ]);
    expect(record).toMatchObject({ runs: 5, open: 1, scored: 3, won: 2, lost: 1, unscored: 1 });
    expect(record.hitRate).toBeCloseTo(2 / 3, 5);
    expect(record.byGrade).toEqual([
      { letter: "A", runs: 1, scored: 0, won: 0 },
      { letter: "B+", runs: 2, scored: 2, won: 2 },
      { letter: "B", runs: 1, scored: 0, won: 0 },
      { letter: "C", runs: 1, scored: 1, won: 0 },
    ]);
    // The line is cumulative, in the order runs ended.
    expect(record.series.map((p) => [p.day, p.won, p.scored])).toEqual([
      ["2026-09-06", 1, 1],
      ["2026-09-10", 1, 2],
      ["2026-09-12", 2, 3],
    ]);
    expect(record.rows[0].term).toBe("hard water");
    expect(hitRateLine(record)).toBe("2 of 3 picks you ran won.");
    expect(ratePct(record.hitRate)).toBe("67%");
  });

  it("says plainly what a grade has and hasn't done here", () => {
    const record = buildTrackRecord([
      { run: run({ verdict: "won" }), pick: pick("hard water", "B+") },
      { run: run({ status: "running", ended_at: null }), pick: pick("shower filter", "A") },
    ]);
    expect(calibrationLine(record, "B+")).toBe("B+ picks have won 1 of 1 for you so far.");
    expect(calibrationLine(record, "A")).toBe("1 A pick is running or unscored; none finished with a result yet.");
    expect(calibrationLine(record, "A+")).toBe("No A+ picks have finished running for you yet.");
    expect(calibrationLine(record, "Hold")).toBeNull();
    expect(calibrationLine(record, null)).toBeNull();
  });

  it("is empty and honest with no runs", () => {
    const record = buildTrackRecord([]);
    expect(record).toMatchObject({ runs: 0, scored: 0, hitRate: null, byGrade: [], series: [], rows: [] });
    expect(hitRateLine(record)).toBeNull();
    expect(ratePct(null)).toBe("—");
  });
});
