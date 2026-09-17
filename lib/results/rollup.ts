import type { CampaignResult, PickRun } from "@/lib/db/types";

/**
 * The results strip: what the campaigns did and what the creative tests
 * did, in one set of numbers. Campaign results come from the older
 * campaign flow (manual entry or the Meta sync); a creative test's numbers
 * sit on its run. The strip used to read only the first, so a brand whose
 * whole month was creative tests saw a blank strip over a full track
 * record. Pure, so the arithmetic is tested rather than eyeballed.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export interface ResultsRollup {
  /** Campaign results recorded. */
  flights: number;
  /** Creative tests that ended with numbers. */
  tests: number;
  spendCents: number;
  revenueCents: number;
  bookings: number;
  /** Revenue over spend; null without spend. */
  roas: number | null;
  /** Mean click-through across every flight and test that has one. */
  avgCtr: number | null;
}

/** A run counts once it ended and carries at least one number. */
export function completedRunsWithNumbers(runs: Pick<PickRun, "status" | "spend_usd" | "impressions" | "clicks" | "conversions" | "revenue_usd">[]) {
  return runs.filter(
    (r) =>
      (r.status === "completed" || r.status === "killed") &&
      [r.spend_usd, r.impressions, r.clicks, r.conversions, r.revenue_usd].some((v) => num(v) !== null),
  );
}

export function rollupResults(
  results: Pick<CampaignResult, "spend_cents" | "revenue_cents" | "bookings" | "ctr">[],
  runs: Pick<PickRun, "status" | "spend_usd" | "impressions" | "clicks" | "conversions" | "revenue_usd">[],
): ResultsRollup {
  const tests = completedRunsWithNumbers(runs);
  let spendCents = 0;
  let revenueCents = 0;
  let bookings = 0;
  const ctrs: number[] = [];
  for (const r of results) {
    spendCents += num(r.spend_cents) ?? 0;
    revenueCents += num(r.revenue_cents) ?? 0;
    bookings += num(r.bookings) ?? 0;
    const ctr = num(r.ctr);
    if (ctr !== null) ctrs.push(ctr);
  }
  for (const r of tests) {
    spendCents += Math.round((num(r.spend_usd) ?? 0) * 100);
    revenueCents += Math.round((num(r.revenue_usd) ?? 0) * 100);
    bookings += num(r.conversions) ?? 0;
    const imp = num(r.impressions);
    const clicks = num(r.clicks);
    if (imp && imp > 0 && clicks !== null) ctrs.push(clicks / imp);
  }
  return {
    flights: results.length,
    tests: tests.length,
    spendCents,
    revenueCents,
    bookings,
    roas: spendCents > 0 ? revenueCents / spendCents : null,
    avgCtr: ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null,
  };
}

/** "3 flights, 2 tests" / "1 test" / "0 flights". */
export function rollupCountLabel(r: Pick<ResultsRollup, "flights" | "tests">): string {
  const parts: string[] = [];
  if (r.flights > 0 || r.tests === 0) parts.push(`${r.flights} ${r.flights === 1 ? "flight" : "flights"}`);
  if (r.tests > 0) parts.push(`${r.tests} ${r.tests === 1 ? "test" : "tests"}`);
  return parts.join(", ");
}
