import type { Signal } from "@/lib/db/types";

import { demandPoints, pointsCaption, type DemandPointsResult } from "./points";

/**
 * The eight-week demand line, in TRND points.
 *
 * Built from SIGNAL history rather than the stored daily series, because
 * `signal_series_points` keeps only (term, geo, day, value) — it drops the
 * source, and without the source a value cannot be converted to reach. A
 * Google Trends 63 and a YouTube 63 are not the same quantity and must not
 * be added. The signals table keeps source and metric_type on every row and
 * has a daily unique index, so one row per source per day is exactly what
 * this needs, and it costs no migration.
 *
 * Each week is scored on its own: the most recent read per source inside
 * that week, summed to reach, mapped to points. A week nothing was measured
 * in is omitted rather than interpolated — a flat segment drawn through a
 * gap is a claim that demand held, which is not something a missing read
 * can support.
 */

const DAY_MS = 86400_000;

export interface DemandWeekPoint {
  /** The last day of the bucket, yyyy-mm-dd. */
  day: string;
  points: number;
}

export interface DemandLine {
  weeks: DemandWeekPoint[];
  /** This week's full result, for the caption and the headline number. */
  current: DemandPointsResult | null;
  caption: string | null;
  /** Week-over-week change in points, or null without two weeks to compare. */
  deltaPct: number | null;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * @param signals every signal held for one term (any source), newest-first
 *   or not — order does not matter.
 * @param now the end of the most recent bucket.
 * @param weeks how many 7-day buckets to walk back.
 */
export function buildDemandLine(signals: Signal[], now = new Date(), weeks = 8): DemandLine {
  const buckets: DemandWeekPoint[] = [];
  let current: DemandPointsResult | null = null;

  for (let w = weeks - 1; w >= 0; w--) {
    const end = now.getTime() - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = signals.filter((s) => {
      const at = Date.parse(s.captured_at);
      return Number.isFinite(at) && at > start && at <= end;
    });
    if (inWeek.length === 0) continue;

    // One read per source per bucket: the latest. Summing every daily row in
    // a week would multiply a steady term's reach by seven.
    const latest = new Map<string, Signal>();
    for (const s of inWeek) {
      const key = `${s.source}:${s.metric_type}`;
      const prev = latest.get(key);
      if (!prev || Date.parse(s.captured_at) > Date.parse(prev.captured_at)) latest.set(key, s);
    }
    const result = demandPoints(
      [...latest.values()].map((s) => ({
        source: s.source,
        metricType: s.metric_type,
        value: s.value,
      })),
    );
    if (result.points === null) continue;
    buckets.push({ day: dayOf(new Date(end).toISOString()), points: result.points });
    if (w === 0) current = result;
  }

  // Without a current-week read the last measured bucket is the best the
  // caption can honestly describe.
  const deltaPct =
    buckets.length >= 2
      ? (() => {
          const prev = buckets[buckets.length - 2].points;
          const last = buckets[buckets.length - 1].points;
          if (prev <= 0) return null;
          return Math.round(((last - prev) / prev) * 100);
        })()
      : null;

  return {
    weeks: buckets,
    current,
    caption: current ? pointsCaption(current) : null,
    deltaPct,
  };
}
