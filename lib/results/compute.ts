/**
 * Results math + the learnings write-back. Pure and unit-tested — this is
 * the flywheel, so the mapping from "what happened" to "what we believe next
 * week" must be inspectable in one place.
 */

import { benchmarkFor } from "./benchmarks";

export interface ResultInput {
  impressions: number | null;
  clicks: number | null;
  spend_cents: number | null;
  bookings: number | null;
  revenue_cents: number | null;
}

export function computeCtr(input: ResultInput): number | null {
  if (!input.impressions || input.clicks === null) return null;
  if (input.impressions <= 0) return null;
  return Math.round((input.clicks / input.impressions) * 10000) / 10000;
}

/** Cost per result — bookings first, clicks as fallback. */
export function computeCpaCents(input: ResultInput): number | null {
  if (input.spend_cents === null) return null;
  const results = input.bookings || input.clicks;
  if (!results) return null;
  return Math.round(input.spend_cents / results);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A campaign that lands a booking at all beat the click. */
const BOOKING_BONUS = 0.1;
/** Revenue over spend is the only outcome that pays the bill. */
const PROFITABLE_BONUS = 0.15;

/**
 * Lift: 0..1 read of how well this campaign ran, against *its own category's*
 * benchmark rather than one global number — a 1.2% CTR is a weak facial ad
 * and a strong HVAC one, and a flywheel that can't tell those apart teaches
 * every category the same lesson. Benchmark CTR scores the neutral 0.5;
 * twice the benchmark is the ceiling. The generic benchmark (1.5%) reproduces
 * the 3%-ceiling this used to hardcode, so an uncategorized read is unchanged.
 *
 * Benchmarks are illustrative until enough measured results exist to replace
 * them (`lib/results/benchmarks.ts`) — the ceiling moves when they do.
 */
export function computeLift(input: ResultInput, category?: string): number {
  const ctr = computeCtr(input);
  const benchmark = benchmarkFor(category ?? "");
  let lift = 0.5;
  if (ctr !== null) {
    lift = clamp01((0.5 * ctr) / benchmark);
  }
  if (input.bookings && input.bookings > 0) {
    lift = clamp01(lift + BOOKING_BONUS);
  }
  if (input.revenue_cents && input.spend_cents && input.revenue_cents > input.spend_cents) {
    lift = clamp01(lift + PROFITABLE_BONUS);
  }
  return Math.round(lift * 100) / 100;
}

/**
 * The newest result never counts for less than this. A plain running mean
 * weights a campaign from a year ago exactly like last week's — so a belief
 * built on ten old results can no longer be moved by what is true now. Below
 * ~6 observations 1/(n+1) is larger and this floor never binds; past that the
 * estimate tracks recent reality instead of being anchored by history.
 */
export const RECENCY_FLOOR = 0.15;

/**
 * Blend a new observation into an existing learning: a running mean while the
 * sample is small, an exponentially-weighted one once it isn't. `sample_size`
 * keeps counting regardless — it is how much we know, which never decays even
 * when what we believe does.
 */
export function blendLearning(
  existing: { lift: number; sample_size: number } | null,
  observedLift: number,
): { lift: number; sample_size: number } {
  if (!existing || existing.sample_size <= 0) {
    return { lift: observedLift, sample_size: 1 };
  }
  const n = existing.sample_size;
  const weight = Math.max(1 / (n + 1), RECENCY_FLOOR);
  const lift = Math.round((existing.lift * (1 - weight) + observedLift * weight) * 100) / 100;
  return { lift, sample_size: n + 1 };
}
