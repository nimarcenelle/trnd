/**
 * Results math + the learnings write-back. Pure and unit-tested — this is
 * the flywheel, so the mapping from "what happened" to "what we believe next
 * week" must be inspectable in one place.
 */

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

/**
 * Lift: 0..1 read of how well this campaign ran. 0.5 is "as expected".
 * CTR vs a 1.5% paid-social baseline carries most of it; landing a booking
 * at all nudges it up; revenue over spend nudges further.
 */
export function computeLift(input: ResultInput): number {
  const ctr = computeCtr(input);
  let lift = 0.5;
  if (ctr !== null) {
    lift = clamp01(ctr / 0.03); // 3% CTR ≈ ceiling
  }
  if (input.bookings && input.bookings > 0) {
    lift = clamp01(lift + 0.1);
  }
  if (input.revenue_cents && input.spend_cents && input.revenue_cents > input.spend_cents) {
    lift = clamp01(lift + 0.15);
  }
  return Math.round(lift * 100) / 100;
}

/** Blend a new observation into an existing learning by sample size. */
export function blendLearning(
  existing: { lift: number; sample_size: number } | null,
  observedLift: number,
): { lift: number; sample_size: number } {
  if (!existing || existing.sample_size <= 0) {
    return { lift: observedLift, sample_size: 1 };
  }
  const n = existing.sample_size;
  const lift = Math.round(((existing.lift * n + observedLift) / (n + 1)) * 100) / 100;
  return { lift, sample_size: n + 1 };
}
