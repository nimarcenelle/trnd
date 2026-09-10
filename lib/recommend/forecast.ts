import { benchmarkFor } from "@/lib/results/benchmarks";

/**
 * What a test flight should return, in the owner's units. A daily budget
 * on its own is a SaaS number; "about 900 clicks and 20 to 30 bookings"
 * is a decision. Every figure is a category-benchmark estimate and is
 * labeled that way on screen; the first recorded result replaces it.
 */

/** Illustrative local paid-social CPM (USD per 1,000 impressions). */
export const ASSUMED_CPM = 12;
/** Illustrative click-to-booking rate for a local offer with a price on it. */
export const ASSUMED_BOOKING_RATE: [number, number] = [0.03, 0.05];

export interface FlightForecast {
  spend: [number, number];
  impressions: [number, number];
  clicks: [number, number];
  bookings: [number, number];
  /** The CTR assumed, as a percentage string ("1.6%"). */
  ctrLabel: string;
  days: number;
}

/** Parse "$25–50" into [25, 50]. */
export function parseDailyRange(daily: string): [number, number] {
  const nums = daily.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [25, 50];
}

const round = (n: number, to: number) => Math.round(n / to) * to;

export function forecastFlight(opts: { daily: string; category: string; days?: number }): FlightForecast {
  const days = opts.days ?? 6;
  const [lo, hi] = parseDailyRange(opts.daily);
  const ctr = benchmarkFor(opts.category);
  const spend: [number, number] = [lo * days, hi * days];
  const impressions: [number, number] = [(spend[0] / ASSUMED_CPM) * 1000, (spend[1] / ASSUMED_CPM) * 1000];
  const clicks: [number, number] = [impressions[0] * ctr, impressions[1] * ctr];
  const bookings: [number, number] = [clicks[0] * ASSUMED_BOOKING_RATE[0], clicks[1] * ASSUMED_BOOKING_RATE[1]];
  return {
    spend,
    impressions: [round(impressions[0], 500), round(impressions[1], 500)],
    clicks: [round(clicks[0], 10), round(clicks[1], 10)],
    bookings: [Math.max(1, Math.round(bookings[0])), Math.max(1, Math.round(bookings[1]))],
    ctrLabel: `${(ctr * 100).toFixed(1)}%`,
    days,
  };
}

const fmtRange = ([a, b]: [number, number]) => (a === b ? `${a.toLocaleString()}` : `${a.toLocaleString()}–${b.toLocaleString()}`);

/** One line for the owner: "About 900–1,800 clicks and 20–70 bookings for $150–300 over 6 days (estimate at 1.6% CTR)." */
export function forecastLine(f: FlightForecast): string {
  return `About ${fmtRange(f.clicks)} clicks and ${fmtRange(f.bookings)} bookings for $${fmtRange(f.spend)} over ${f.days} days — an estimate at a ${f.ctrLabel} category CTR, replaced by your real numbers once you record a result.`;
}
