/**
 * Where a trend sits in its lifecycle, read from the shape of its daily
 * series. A smaller trend still rising should outscore a bigger one about to
 * roll over, so the stage matters more than the size.
 *
 * "The max" here is the highest 7-day mean anywhere in the series, so a
 * single noisy day can't make the current week look far from its peak.
 */

import type { DailyPoint, LifecycleStage } from "./model";

export const LIFECYCLE_MIN_POINTS = 14;
/** With this much history, the last two weeks are read against the first month too. */
export const QUARTER_MIN_POINTS = 60;

export interface LifecycleRead {
  stage: LifecycleStage;
  /** Last 7 days against the prior 7, as a fraction (0.2 = up 20%). */
  weekChange: number;
  /** Last 7-day mean as a share of the series' highest 7-day mean, 0-1. */
  relativeLevel: number;
  /** Last 14 days against the series' first 30, as a fraction; null under
   * QUARTER_MIN_POINTS. */
  quarterChange: number | null;
  /** Which comparison decided the stage. */
  basis: "week" | "month" | "quarter" | "none";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export function readLifecycle(series: DailyPoint[]): LifecycleRead | null {
  const values = series.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < LIFECYCLE_MIN_POINTS) return null;

  const last7 = mean(values.slice(-7));
  const prior7 = mean(values.slice(-14, -7));
  // Everything before the last week: the level it rose from.
  const before = mean(values.slice(0, -7));
  const first7 = mean(values.slice(0, 7));
  let peak = 0;
  for (let i = 7; i <= values.length; i += 1) peak = Math.max(peak, mean(values.slice(i - 7, i)));

  if (peak <= 0) return { stage: "flat", weekChange: 0, relativeLevel: 0, quarterChange: null, basis: "none" };

  const weekChange = prior7 > 0 ? (last7 - prior7) / prior7 : last7 > 0 ? 1 : 0;
  const relativeLevel = last7 / peak;
  // A rise that already happened last week is still a rise. "hard water" ran
  // 93% above its month but only 10% above the week before, and a
  // week-over-week-only test read that as holding steady.
  const sustained = before > 0 && last7 >= before * 1.3 && weekChange >= 0.05;
  const rising = weekChange >= 0.2 || sustained;
  const nearPeak = last7 >= peak * 0.9;
  const belowPeak = last7 < peak;
  // It got to its peak by climbing, rather than starting there.
  const roseToPeak = peak >= first7 * 1.2;

  // The week-over-week read misses moves that happened weeks ago. Real
  // monthly search volume steps: "brassy blonde hair" sat at zero, jumped to
  // about 23 three weeks back and held there; "hard water" slid from 83 to
  // 45 over the quarter. Both read as holding steady week to week. With 60+
  // days, the last two weeks are also read against the first month.
  const first30 = mean(values.slice(0, 30));
  const last14 = mean(values.slice(-14));
  const quarterChange =
    values.length < QUARTER_MIN_POINTS ? null : first30 > 0 ? last14 / first30 - 1 : last14 > 0 ? Infinity : 0;

  // A jump inside the last six weeks that is holding at its new level is a
  // rise still being ridden, not a peak: weeks four to six ago sat well below
  // the last two. Without this, a fresh plateau read as peaking or growing
  // depending on whether its noisiest week happened to be its highest.
  const weeksFourToSix = mean(values.slice(-42, -21));
  const recentRise =
    values.length >= 42 && last14 > 0 && (weeksFourToSix === 0 || last14 >= weeksFourToSix * 1.5) && weekChange > -0.15;

  let stage: LifecycleStage = "flat";
  let basis: LifecycleRead["basis"] = "none";
  if (relativeLevel < 0.4 && rising) {
    stage = "emerging";
    basis = weekChange >= 0.2 ? "week" : "month";
  } else if (rising) {
    stage = "growing";
    basis = weekChange >= 0.2 ? "week" : "month";
  } else if (recentRise && quarterChange !== null && quarterChange >= 0.3) {
    stage = "growing";
    basis = "quarter";
  } else if (nearPeak && weekChange < 0.05 && roseToPeak) {
    stage = "peaking";
    basis = "week";
  } else if (weekChange <= -0.15 && belowPeak) {
    stage = "declining";
    basis = "week";
  } else if (quarterChange !== null && quarterChange >= 0.3 && weekChange > -0.15) {
    stage = "growing";
    basis = "quarter";
  } else if (quarterChange !== null && quarterChange <= -0.3 && relativeLevel < 0.75) {
    stage = "declining";
    basis = "quarter";
  }

  return { stage, weekChange, relativeLevel, quarterChange, basis };
}

export function lifecycleStage(series: DailyPoint[]): LifecycleStage | null {
  return readLifecycle(series)?.stage ?? null;
}

const STAGE_SCORE: Record<LifecycleStage, number> = {
  emerging: 90,
  growing: 80,
  flat: 50,
  peaking: 35,
  declining: 15,
};

export function lifecycleScore(stage: LifecycleStage): number {
  return STAGE_SCORE[stage];
}
