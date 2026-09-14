import { describe, expect, it } from "vitest";

import { runOutcome } from "../lib/record/outcome";

const base = { status: "completed" as const, spend_usd: null, impressions: null, clicks: null, conversions: null, revenue_usd: null };

describe("runOutcome", () => {
  it("is open while running, whatever the numbers say", () => {
    expect(runOutcome({ ...base, status: "running", revenue_usd: 9000, spend_usd: 100 }).outcome).toBe("open");
  });

  it("takes the owner's verdict over the numbers", () => {
    expect(runOutcome({ ...base, verdict: "lost", revenue_usd: 9000, spend_usd: 100 })).toMatchObject({ outcome: "lost", basis: "verdict" });
    expect(runOutcome({ ...base, status: "killed", verdict: "won" })).toMatchObject({ outcome: "won", basis: "verdict" });
  });

  it("counts a killed run as lost", () => {
    expect(runOutcome({ ...base, status: "killed" })).toEqual({ outcome: "lost", reason: "You killed it", basis: "killed" });
  });

  it("judges return on spend first: 1.5x wins, under 1x loses", () => {
    expect(runOutcome({ ...base, spend_usd: 500, revenue_usd: 1200 })).toEqual({ outcome: "won", reason: "ROAS 2.4x", basis: "roas" });
    expect(runOutcome({ ...base, spend_usd: 500, revenue_usd: 400 })).toMatchObject({ outcome: "lost", reason: "ROAS 0.8x, under break-even" });
    // Postgres numerics arrive as strings.
    expect(runOutcome({ ...base, spend_usd: "500" as unknown as number, revenue_usd: "900" as unknown as number }).outcome).toBe("won");
  });

  it("falls back to click-through against the account, then the category", () => {
    const run = { ...base, impressions: 10_000, clicks: 200 };
    expect(runOutcome(run, { accountCtr: 0.015 })).toEqual({ outcome: "won", reason: "CTR 2.0% vs 1.5% your average", basis: "ctr" });
    expect(runOutcome(run, { accountCtr: 0.03 })).toMatchObject({ outcome: "lost" });
    expect(runOutcome(run, { benchmarkCtr: 0.018 })).toMatchObject({ outcome: "won", reason: "CTR 2.0% vs 1.8% the category average" });
    // Break-even ROAS with a CTR read: the CTR decides, the ROAS is named.
    expect(runOutcome({ ...run, spend_usd: 100, revenue_usd: 120 }, { accountCtr: 0.015 })).toMatchObject({
      outcome: "won",
      reason: "ROAS 1.2x, CTR 2.0% vs 1.5% your average",
    });
  });

  it("never invents a score from nothing", () => {
    expect(runOutcome(base)).toEqual({ outcome: "unscored", reason: "Completed without numbers or a verdict", basis: "none" });
    expect(runOutcome({ ...base, spend_usd: 100, revenue_usd: 120 })).toMatchObject({ outcome: "unscored", reason: "ROAS 1.2x, about break-even" });
    expect(runOutcome({ ...base, impressions: 100, clicks: 3 })).toMatchObject({ outcome: "unscored" });
  });
});
