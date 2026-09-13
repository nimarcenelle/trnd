/**
 * Customer signal: who the customer is, then what that specific group is
 * doing on social right now, not category noise.
 *
 * Volume 40% (against this persona's own baseline, discounted when the term
 * isn't how the persona talks), intent 35% (real pain or buying signals in
 * their activity), velocity 25% (last 7 days against last 30).
 */

import { intentStrength, classifyIntent } from "./intent";
import {
  MIN_BASELINE,
  SUB_WEIGHTS,
  percentileRank,
  signalScore,
  type Confidence,
  type CustomerInput,
  type SignalComponent,
  type SignalScore,
} from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export const CUSTOMER_LOW_NOTE = "Not enough of your customers' activity on this yet";
export const VELOCITY_MIN_POINTS = 21;

/**
 * Absolute fallback for volume when the baseline is too thin to rank against:
 * a log curve, 10 readings is 25, 100 is 50, 1,000 is 75, 10,000 or more is 100.
 */
export function absoluteVolumeScore(level: number): number {
  return round1(clamp(25 * Math.log10(Math.max(0, level) + 1)));
}

/** Ratio of the 7-day mean to the 30-day mean: 0.5 or less is 0, 1.0 is 50,
 * 2.0 or more is 100, linear between. */
export function ratioScore(ratio: number): number {
  if (!Number.isFinite(ratio)) return 100;
  if (ratio <= 0.5) return 0;
  if (ratio <= 1) return round1(((ratio - 0.5) / 0.5) * 50);
  return round1(clamp(50 + (ratio - 1) * 50));
}

function relativeWeek(score: number): string {
  if (score >= 80) return "Stronger than almost every recent week";
  if (score >= 60) return "Stronger than most recent weeks";
  if (score >= 40) return "About a normal week";
  if (score >= 20) return "Quieter than most recent weeks";
  return "One of the quietest weeks lately";
}

export function scoreCustomer(input: CustomerInput): SignalScore {
  const w = SUB_WEIGHTS.customer;

  // Volume vs this persona's own baseline.
  let volume: number | null = null;
  let volumeDetail = "No volume reading for this yet";
  const pct = input.level === null ? null : percentileRank(input.level, input.levelBaseline);
  if (input.level !== null) {
    const base = pct ?? absoluteVolumeScore(input.level);
    const match = input.personaMatch === null ? null : clamp(input.personaMatch, 0, 1);
    volume = round1(match === null ? base : base * (0.5 + 0.5 * match));
    volumeDetail =
      pct === null
        ? `${Math.round(input.level).toLocaleString("en-US")} this week, with too little history to compare against`
        : `${relativeWeek(pct)} for your customers`;
    if (match !== null && match < 0.5) volumeDetail += ", though it is only partly how they talk";
  }

  // Intent strength in the persona's activity.
  const intent = intentStrength(input.activity);
  let intentDetail = "No customer posts or comments read on this yet";
  if (intent !== null) {
    const strong = input.activity.filter((a) => {
      const k = a.kind ?? classifyIntent(a.text);
      return k === "purchase_intent" || k === "pain_point" || k === "complaint";
    }).length;
    intentDetail = `${strong} of ${input.activity.length} customer posts show a real problem or a wish to buy`;
  }

  // Velocity: last 7 days vs last 30.
  let velocity: number | null = null;
  let velocityDetail = "Less than three weeks of daily history";
  const values = input.series.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length >= VELOCITY_MIN_POINTS) {
    const m7 = mean(values.slice(-7));
    const m30 = mean(values.slice(-30));
    const ratio = m30 > 0 ? m7 / m30 : m7 > 0 ? Infinity : 1;
    velocity = ratioScore(ratio);
    const diff = Math.round((ratio - 1) * 100);
    velocityDetail =
      !Number.isFinite(ratio)
        ? "Picked up this week from nothing"
        : Math.abs(diff) < 5
          ? "Last week ran in line with the past month"
          : `Last week ran ${Math.abs(diff)}% ${diff > 0 ? "above" : "below"} the past month's average`;
  }

  const components: SignalComponent[] = [
    { key: "volume", label: "Volume", weight: w.volume, score: volume, detail: volumeDetail },
    { key: "intent", label: "Intent", weight: w.intent, score: intent, detail: intentDetail },
    { key: "velocity", label: "Velocity", weight: w.velocity, score: velocity, detail: velocityDetail },
  ];

  const nulls = components.filter((c) => c.score === null).length;
  let confidence: Confidence = "medium";
  if ((input.personaMatch === null && input.level === null) || nulls >= 2) confidence = "low";
  else if (
    input.personaMatch !== null &&
    pct !== null &&
    input.levelBaseline.filter((v) => Number.isFinite(v)).length >= MIN_BASELINE &&
    input.activity.length >= 5 &&
    values.length >= VELOCITY_MIN_POINTS
  )
    confidence = "high";

  return signalScore("customer", components, confidence, {
    note: confidence === "low" || nulls === components.length ? CUSTOMER_LOW_NOTE : null,
  });
}
