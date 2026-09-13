/**
 * Culture signal: the whole category, deliberately broader than the brand's
 * customers, to catch things early. The lifecycle stage matters more than
 * raw size.
 *
 * Category growth 40% (against the category's own recent growth), seasonal
 * fit 30%, lifecycle stage 30%.
 */

import { lifecycleScore, readLifecycle, LIFECYCLE_MIN_POINTS, type LifecycleRead } from "./lifecycle";
import {
  SUB_WEIGHTS,
  percentileRank,
  signalScore,
  type Confidence,
  type CultureInput,
  type SignalComponent,
  type SignalScore,
} from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const CULTURE_LOW_NOTE = "Not enough category activity read yet";
export const SEASON_NEAR_DAYS = 21;

/** Absolute fallback for growth: -50% or worse is 0, flat is 40, +50% or
 * more is 100, linear between. */
export function absoluteGrowthScore(pct: number): number {
  if (pct <= -50) return 0;
  if (pct <= 0) return round1(((pct + 50) / 50) * 40);
  return round1(clamp(40 + (pct / 50) * 60));
}

function growthPhrase(score: number): string {
  if (score >= 80) return "faster than almost any recent stretch";
  if (score >= 60) return "faster than most recent stretches";
  if (score >= 40) return "about the usual pace";
  if (score >= 20) return "slower than most recent stretches";
  return "one of the slowest stretches lately";
}

function lifecycleDetail(read: LifecycleRead | null): string {
  if (!read) return "Too little daily history to tell where this is headed";
  const change = Math.round(Math.abs(read.weekChange) * 100);
  switch (read.stage) {
    case "emerging":
      return `Early: still small, and up ${change}% on the week before`;
    case "growing":
      return read.relativeLevel < 1
        ? `Rising: up ${change}% on the week before and still below its peak`
        : `Rising: up ${change}% on the week before and at a new high`;
    case "peaking":
      return "Near its peak and leveling off";
    case "declining":
      return `Falling: down ${change}% on the week before`;
    default:
      return "Holding steady week to week";
  }
}

export function scoreCulture(input: CultureInput): SignalScore {
  const w = SUB_WEIGHTS.culture;

  // Category-wide growth.
  let growth: number | null = null;
  let growthDetail = `No growth reading for ${input.category || "the category"} yet`;
  const g = input.categoryGrowthPct;
  const pct = g === null ? null : percentileRank(g, input.categoryGrowthBaseline);
  if (g !== null) {
    growth = pct ?? absoluteGrowthScore(g);
    const move = `${input.category || "Category"} ${g >= 0 ? "up" : "down"} ${Math.abs(Math.round(g))}%`;
    growthDetail = pct === null ? `${move}, with too little history to compare against` : `${move}, ${growthPhrase(pct)}`;
  }

  // Seasonal fit.
  let seasonal: number | null = null;
  let seasonalDetail = "No seasonal pattern known for this";
  const s = input.seasonal;
  if (s) {
    const what = s.label ?? "its season";
    if (s.inWindow) {
      seasonal = 90;
      seasonalDetail = `In season now: ${what}`;
    } else if (s.daysOut !== null && Math.abs(s.daysOut) <= SEASON_NEAR_DAYS) {
      seasonal = 70;
      const days = Math.abs(s.daysOut);
      seasonalDetail = s.daysOut >= 0 ? `${what} starts in ${days} days` : `${what} ended ${days} days ago`;
    } else {
      seasonal = 30;
      seasonalDetail = `Out of season: ${what}`;
    }
  }

  // Lifecycle stage.
  const read = readLifecycle(input.series);
  const lifecycle = read ? lifecycleScore(read.stage) : null;

  const components: SignalComponent[] = [
    { key: "growth", label: "Category growth", weight: w.growth, score: growth, detail: growthDetail },
    { key: "seasonal", label: "Seasonal fit", weight: w.seasonal, score: seasonal, detail: seasonalDetail },
    { key: "lifecycle", label: "Lifecycle", weight: w.lifecycle, score: lifecycle, detail: lifecycleDetail(read) },
  ];

  const seriesPoints = input.series.filter((p) => Number.isFinite(p.value)).length;
  let confidence: Confidence = "medium";
  if (g === null && seriesPoints < LIFECYCLE_MIN_POINTS) confidence = "low";
  // High needs a full baseline, so the absolute fallback never gets past medium.
  else if (pct !== null && s !== null && read !== null) confidence = "high";

  const low = confidence === "low" || components.every((c) => c.score === null);
  return signalScore("culture", components, confidence, { note: low ? CULTURE_LOW_NOTE : null });
}
