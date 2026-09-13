/**
 * Customer signal: who the customer is, then what that specific group is
 * doing on social right now, not category noise.
 *
 * Volume 40% (against this persona's own baseline, discounted when the term
 * isn't how the persona talks), intent 35% (real pain or buying signals in
 * what they write, and whether their short-form on it makes people share
 * and save), velocity 25% (last 7 days against last 30).
 */

import { intentStrength, classifyIntent } from "./intent";
import {
  MIN_BASELINE,
  SUB_WEIGHTS,
  percentileRank,
  signalScore,
  type Confidence,
  type CustomerInput,
  type LevelKind,
  type SignalComponent,
  type SignalScore,
} from "./model";

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export const CUSTOMER_LOW_NOTE = "Not enough of your customers' activity on this yet";
/** Two weeks of daily history: the last seven days against the seven before. */
export const VELOCITY_MIN_POINTS = 14;
/** Fewer customer posts than this and a share-of-intent is one person's mood. */
export const MIN_ACTIVITY = 3;
/** Posts read before the intent read is trusted enough for high confidence. */
export const HIGH_ACTIVITY = 5;

/**
 * Absolute fallback for volume when the baseline is too thin to rank against.
 * Each kind of level has its own curve, because 10,000 monthly searches and
 * 10,000 short-form views are not the same size of demand:
 * - searches or conversation: 10 is 25, 100 is 50, 1,000 is 75, 10,000 is 100
 * - short-form views: 100 is 25, 1,000 is 50, 10,000 is 75, 100,000 is 100
 * - a Trends index or an indexed series: the value itself, already 0-100
 */
export function absoluteVolumeScore(level: number, kind: LevelKind = "search_volume"): number {
  const v = Math.max(0, level);
  if (kind === "search_interest" || kind === "index") return round1(clamp(v));
  if (kind === "shortform_views") return round1(clamp(25 * Math.log10(v / 10 + 1)));
  return round1(clamp(25 * Math.log10(v + 1)));
}

/** Ratio of the 7-day mean to the 30-day mean: 0.5 or less is 0, 1.0 is 50,
 * 2.0 or more is 100, linear between. */
export function ratioScore(ratio: number): number {
  if (!Number.isFinite(ratio)) return 100;
  if (ratio <= 0.5) return 0;
  if (ratio <= 1) return round1(((ratio - 0.5) / 0.5) * 50);
  return round1(clamp(50 + (ratio - 1) * 50));
}

/**
 * Shares and saves per view, as a percent, to 0-100. Short-form that gets
 * saved is short-form someone means to act on: 0.1% is 25, 0.5% is 50,
 * 1% is 75, 2% or more is 100, linear between.
 */
export function actionScore(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (pct <= 0.1) return round1((pct / 0.1) * 25);
  if (pct <= 0.5) return round1(25 + ((pct - 0.1) / 0.4) * 25);
  if (pct <= 1) return round1(50 + ((pct - 0.5) / 0.5) * 25);
  return round1(clamp(75 + ((pct - 1) / 1) * 25));
}

function relativeWeek(score: number): string {
  if (score >= 80) return "Stronger than almost every recent week";
  if (score >= 60) return "Stronger than most recent weeks";
  if (score >= 40) return "About a normal week";
  if (score >= 20) return "Quieter than most recent weeks";
  return "One of the quietest weeks lately";
}

function levelPhrase(level: number, kind: LevelKind): string {
  const n = Math.round(level).toLocaleString("en-US");
  switch (kind) {
    case "shortform_views":
      return `${n} short-form views this week`;
    case "conversation":
      return `${n} posts about it this week`;
    case "search_interest":
    case "index":
      // An interest index reads against its own peak; above 100 it is a
      // multiple of the usual level, not a score out of 100.
      return level > 100
        ? `Search interest at ${(level / 100).toFixed(1)}× its usual level this week`
        : `Search interest at ${n} of 100 this week`;
    default:
      return `${n} searches this week`;
  }
}

function actionPhrase(pct: number): string {
  const strength = pct >= 1 ? "strong" : pct >= 0.5 ? "healthy" : pct >= 0.1 ? "modest" : "thin";
  return `shares and saves run ${pct.toFixed(pct >= 1 ? 1 : 2)}% of views on its short-form, ${strength} for the format`;
}

export function scoreCustomer(input: CustomerInput): SignalScore {
  const w = SUB_WEIGHTS.customer;
  const kind: LevelKind = input.levelKind ?? "search_volume";

  // Volume vs this persona's own baseline.
  let volume: number | null = null;
  let volumeDetail = "No volume reading for this yet";
  const pct = input.level === null ? null : percentileRank(input.level, input.levelBaseline);
  if (input.level !== null) {
    const base = pct ?? absoluteVolumeScore(input.level, kind);
    const match = input.personaMatch === null ? null : clamp(input.personaMatch, 0, 1);
    volume = round1(match === null ? base : base * (0.5 + 0.5 * match));
    volumeDetail =
      pct === null
        ? `${levelPhrase(input.level, kind)}, with too little history to compare against`
        : `${relativeWeek(pct)} for your customers`;
    if (match !== null && match < 0.5) volumeDetail += ", though it is only partly how they talk";
  }

  // Intent: what they write, and whether their short-form on it makes people act.
  const texts = input.activity.length >= MIN_ACTIVITY ? intentStrength(input.activity) : null;
  const action = typeof input.actionPct === "number" && Number.isFinite(input.actionPct) ? actionScore(input.actionPct) : null;
  let intent: number | null = null;
  let intentDetail =
    input.activity.length > 0 && input.activity.length < MIN_ACTIVITY
      ? `Only ${input.activity.length} customer ${input.activity.length === 1 ? "post" : "posts"} read on this, too few to judge`
      : "No customer posts or comments read on this yet";
  if (texts !== null && action !== null) intent = round1(0.6 * texts + 0.4 * action);
  else if (texts !== null) intent = texts;
  else if (action !== null) intent = action;
  if (texts !== null) {
    const strong = input.activity.filter((a) => {
      const k = a.kind ?? classifyIntent(a.text);
      return k === "purchase_intent" || k === "pain_point" || k === "complaint";
    }).length;
    intentDetail = `${strong} of ${input.activity.length} customer posts show a real problem or a wish to buy`;
    if (action !== null) intentDetail += `, and ${actionPhrase(input.actionPct as number)}`;
  } else if (action !== null) {
    const phrase = actionPhrase(input.actionPct as number);
    intentDetail = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
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

  // A volume reading is a reading: a term with 27,888 posts this week and
  // too little history for velocity is thin, not unknown. Low is for no
  // persona and no level, or nothing at all.
  const nulls = components.filter((c) => c.score === null).length;
  let confidence: Confidence = "medium";
  if ((input.personaMatch === null && input.level === null) || nulls === components.length) confidence = "low";
  else if (
    input.personaMatch !== null &&
    pct !== null &&
    input.levelBaseline.filter((v) => Number.isFinite(v)).length >= MIN_BASELINE &&
    input.activity.length >= HIGH_ACTIVITY &&
    values.length >= VELOCITY_MIN_POINTS
  )
    confidence = "high";

  return signalScore("customer", components, confidence, {
    note: confidence === "low" || nulls === components.length ? CUSTOMER_LOW_NOTE : null,
  });
}
