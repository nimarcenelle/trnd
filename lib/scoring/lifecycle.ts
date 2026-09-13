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

export interface LifecycleRead {
  stage: LifecycleStage;
  /** Last 7 days against the prior 7, as a fraction (0.2 = up 20%). */
  weekChange: number;
  /** Last 7-day mean as a share of the series' highest 7-day mean, 0-1. */
  relativeLevel: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export function readLifecycle(series: DailyPoint[]): LifecycleRead | null {
  const values = series.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < LIFECYCLE_MIN_POINTS) return null;

  const last7 = mean(values.slice(-7));
  const prior7 = mean(values.slice(-14, -7));
  const first7 = mean(values.slice(0, 7));
  let peak = 0;
  for (let i = 7; i <= values.length; i += 1) peak = Math.max(peak, mean(values.slice(i - 7, i)));

  if (peak <= 0) return { stage: "flat", weekChange: 0, relativeLevel: 0 };

  const weekChange = prior7 > 0 ? (last7 - prior7) / prior7 : last7 > 0 ? 1 : 0;
  const relativeLevel = last7 / peak;
  const rising = weekChange >= 0.2;
  const nearPeak = last7 >= peak * 0.9;
  const belowPeak = last7 < peak;
  // It got to its peak by climbing, rather than starting there.
  const roseToPeak = peak >= first7 * 1.2;

  let stage: LifecycleStage = "flat";
  if (relativeLevel < 0.4 && rising) stage = "emerging";
  else if (nearPeak && weekChange < 0.05 && roseToPeak) stage = "peaking";
  else if (rising) stage = "growing";
  else if (weekChange <= -0.15 && belowPeak) stage = "declining";

  return { stage, weekChange, relativeLevel };
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
