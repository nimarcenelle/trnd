import { describe, expect, it } from "vitest";

import type { BrandPick, PickRun, WeekSkip } from "../lib/db/types";
import { notThisWeek, overdueRuns } from "../lib/record/calls";

const now = new Date("2026-09-14T12:00:00Z");
const pick = (term: string, days: number): BrandPick => ({ id: "p", term, bet_duration_days: days, grade: "B+" }) as unknown as BrandPick;
const run = (startedAt: string, status: PickRun["status"] = "running"): PickRun =>
  ({ id: `r-${startedAt}`, status, started_at: startedAt, ended_at: null }) as unknown as PickRun;
const skip = (term: string, kind: WeekSkip["kind"], reason: string, grade: string | null = "Hold"): WeekSkip =>
  ({ id: `s-${term}`, term, normalized_term: term.replace(/\s+/g, "_"), kind, reason, grade }) as unknown as WeekSkip;

describe("the don't calls", () => {
  it("flags a running pick past its bet duration, with the day count", () => {
    const calls = overdueRuns(
      [
        { run: run("2026-09-06T00:00:00Z"), pick: pick("hard water", 5) }, // day 9 of 5
        { run: run("2026-09-12T00:00:00Z"), pick: pick("glass skin", 5) }, // day 3 of 5
        { run: run("2026-09-01T00:00:00Z", "completed"), pick: pick("done", 5) },
      ],
      now,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "run_due", term: "hard water", line: "Day 9 of 5. Enter its results or kill it; the bet was 5 days.", href: "/app/campaigns" });
  });

  it("puts overdue runs first, then the held terms up to the limit", () => {
    const calls = notThisWeek({
      runs: [{ run: run("2026-09-01T00:00:00Z"), pick: pick("hard water", 5) }],
      skips: [
        skip("chlorine", "memory", "You ran this and killed it on Sep 2"),
        skip("espresso martini", "fit", "Doesn't fit what you sell"),
        skip("labor day", "hold", "Competitive wasn't factored in: no competitors connected yet."),
        skip("extra", "hold", "Held"),
      ],
      now,
      limit: 3,
    });
    expect(calls.map((c) => [c.kind, c.term])).toEqual([
      ["run_due", "hard water"],
      ["skip", "chlorine"],
      ["skip", "espresso martini"],
    ]);
    expect(calls[1].line).toBe("You ran this and killed it on Sep 2.");
    expect(calls[3 - 1].href).toBeNull();
  });
});
