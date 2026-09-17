import { describe, expect, it } from "vitest";

import type { PickRun } from "../lib/db/types";
import { completedRunsWithNumbers, rollupCountLabel, rollupResults } from "../lib/results/rollup";

/** The results strip counts the creative tests that ended with numbers
 * beside the campaign results, or a month of tests reads as a blank strip. */

const run = (over: Partial<PickRun>): PickRun => ({ status: "completed", spend_usd: null, impressions: null, clicks: null, conversions: null, revenue_usd: null, ...over }) as PickRun;

describe("rollupResults", () => {
  it("adds completed tests to the flights, in cents, and averages click-through over both", () => {
    const r = rollupResults(
      [{ spend_cents: 10000, revenue_cents: 30000, bookings: 3, ctr: 0.02 }],
      [
        run({ spend_usd: 400.12, impressions: 9000, clicks: 180, conversions: 6, revenue_usd: 960 }),
        run({ status: "killed", spend_usd: 50 }),
        run({ status: "running", spend_usd: 999, impressions: 100, clicks: 10 }),
        run({}),
      ],
    );
    expect(r).toEqual({ flights: 1, tests: 2, spendCents: 55012, revenueCents: 126000, bookings: 9, roas: 126000 / 55012, avgCtr: 0.02 });
  });

  it("is empty and honest with nothing", () => {
    expect(rollupResults([], [])).toEqual({ flights: 0, tests: 0, spendCents: 0, revenueCents: 0, bookings: 0, roas: null, avgCtr: null });
    expect(completedRunsWithNumbers([run({}), run({ status: "running", spend_usd: 5 })])).toEqual([]);
  });

  it("labels the counts the way the strip says them", () => {
    expect(rollupCountLabel({ flights: 3, tests: 2 })).toBe("3 flights, 2 tests");
    expect(rollupCountLabel({ flights: 0, tests: 1 })).toBe("1 test");
    expect(rollupCountLabel({ flights: 1, tests: 0 })).toBe("1 flight");
    expect(rollupCountLabel({ flights: 0, tests: 0 })).toBe("0 flights");
  });
});
