import type { BrandPick, Signal } from "@/lib/db/types";

/**
 * The one number on a pick, computed here and never by a model.
 *
 * A pick shows exactly one metric, and the list row, the detail page and the
 * export all print it through lib/picks/format.ts. So the metric is decided
 * once, from the same weekly and 30-day reads the ranking used, and every
 * other surface (evidence claims, the finding, the scripts) is kept from
 * repeating its figure.
 *
 * No measured change at all means no metric: `pickMetric` returns null and
 * the weekly job stores that pick as a draft. A pick page whose one number
 * is blank is a claim with nothing under it.
 */

export type PickMetric = Pick<
  BrandPick,
  "metric_label" | "metric_value" | "metric_delta_pct" | "metric_window" | "sparkline"
>;

type MetricSignal = Pick<Signal, "source" | "metric_type" | "term" | "value" | "raw">;

export interface MetricInput {
  signal: MetricSignal;
  /** This week's measured change, as the ranking read it (explainOpportunity). */
  weekPct?: number | null;
  /** The 30-day trajectory, as the ranking read it. */
  monthPct?: number | null;
  /** The term's daily series, already passed through indexSeries. */
  series?: { day: string; value: number }[];
}

export const SPARKLINE_DAYS = 30;

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The term the number was actually measured on. A widened read (too few
 * searches for the exact phrase, so the core term was read instead) says so
 * in its label, because the proof link opens the widened term's page.
 */
export function measuredTerm(signal: Pick<Signal, "term" | "raw">): string {
  const raw = signal.raw as { adjusted?: unknown; measuredTerm?: unknown } | null | undefined;
  if (raw?.adjusted === true && typeof raw.measuredTerm === "string" && raw.measuredTerm.trim()) {
    return raw.measuredTerm.trim();
  }
  return signal.term.trim();
}

/** What was measured, in the words a customer would use for it. */
export function metricLabelFor(signal: Pick<Signal, "source" | "metric_type" | "term" | "raw">): string {
  const q = `"${measuredTerm(signal)}"`;
  switch (signal.source) {
    case "tiktok":
      return signal.metric_type === "shortform_views" ? `TikTok views on ${q}` : `TikTok posts on ${q}`;
    case "youtube":
      return `YouTube Shorts views on ${q}`;
    case "instagram":
      return `Instagram Reels on ${q}`;
    case "reddit":
      return `Reddit posts on ${q}`;
    case "x":
      return `Posts on X about ${q}`;
    case "news":
      return `News stories on ${q}`;
    case "meta_ads":
      return `Meta ads on ${q}`;
    case "weather":
      return `Forecast demand for ${q}`;
    default:
      // Trends, search volume, autocomplete, evergreen watch terms: all of
      // them are people typing the term into Google.
      return `Searches for ${q}`;
  }
}

/**
 * The signal's current level, when its value is a count someone could check
 * (monthly searches, views, posts). An interest index is relative to its own
 * peak, so "63" is not a level and is left out.
 */
export function metricLevel(signal: Pick<Signal, "source" | "metric_type" | "value">): number | null {
  if (!finite(signal.value) || signal.value <= 0) return null;
  const counted =
    signal.metric_type === "search_volume" ||
    signal.metric_type === "shortform_views" ||
    signal.metric_type === "video_volume" ||
    (signal.metric_type === "conversation" &&
      (signal.source === "tiktok" || signal.source === "x" || signal.source === "instagram"));
  return counted ? signal.value : null;
}

/** The last 30 daily points, oldest first. Nothing is padded or smoothed: a
 * short series draws a short line. */
/**
 * The last 30 finished days, oldest first. Today is never drawn: Google
 * Trends reports the current day as near zero until it closes, so a line
 * that ended on it crashed to the floor under a chip that said "up 9%"
 * (the week's mean, which was true). A trailing zero after live days is
 * the same artifact a day late and is dropped too. Nothing is padded or
 * smoothed: a short series draws a short line.
 */
export function sparklineOf(series: { day: string; value: number }[] | undefined, now = new Date()): PickMetric["sparkline"] {
  const today = now.toISOString().slice(0, 10);
  const points = [...(series ?? [])]
    .filter((p) => finite(p.value) && p.day < today)
    .sort((a, b) => a.day.localeCompare(b.day));
  while (points.length >= 4 && points[points.length - 1].value === 0 && points.slice(-4, -1).every((p) => p.value > 0)) points.pop();
  return points.slice(-SPARKLINE_DAYS).map((p) => ({ d: p.day, v: p.value }));
}

export function pickMetric(input: MetricInput): PickMetric | null {
  const { signal } = input;
  const week = finite(input.weekPct) ? input.weekPct : null;
  const month = finite(input.monthPct) ? input.monthPct : null;
  if (week === null && month === null) return null;
  // Search volume arrives as monthly totals, so the delta the ranking calls
  // "this week" is really month over month. Printing "week over week" next
  // to it is a claim the source page contradicts.
  const monthlySource = signal.source === "dataforseo";
  const base = {
    metric_label: metricLabelFor(signal),
    metric_value: metricLevel(signal),
    sparkline: sparklineOf(input.series),
  };
  if (week !== null) {
    return { ...base, metric_delta_pct: round1(week), metric_window: monthlySource ? "30d" : "week" };
  }
  return { ...base, metric_delta_pct: round1(month as number), metric_window: "30d" };
}

/**
 * Matches the metric's figure as the page prints it ("49%", "+49 %"), so
 * claims and model copy can be kept from saying it a second time. A fresh
 * RegExp per call: a shared global pattern carries lastIndex between tests.
 */
function deltaPattern(deltaPct: number | null | undefined): RegExp | null {
  if (!finite(deltaPct)) return null;
  const n = Math.abs(Math.round(deltaPct));
  return new RegExp(`(?<![\\d.,])[+-]?${n}(?:\\.\\d+)?\\s?%`, "g");
}

export function mentionsDelta(text: string, deltaPct: number | null | undefined): boolean {
  const re = deltaPattern(deltaPct);
  return re ? re.test(text) : false;
}

/** "ran 49% above your average" becomes "ran above your average". */
export function stripDelta(text: string, deltaPct: number | null | undefined): string {
  const re = deltaPattern(deltaPct);
  if (!re) return text;
  return text.replace(re, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}
