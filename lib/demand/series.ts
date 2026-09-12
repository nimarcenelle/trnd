import type { Signal, SignalSeriesPoint } from "@/lib/db/types";
import { localityFor } from "@/lib/signals/geo";

import { anchorTrendsToVolume } from "./anchor";
import {
  confidenceFor,
  demandPoints,
  pointsCaption,
  pointsFromReach,
  type DemandPointsResult,
} from "./points";

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

export type DemandMode = "points" | "relative";

export interface DemandLine {
  weeks: DemandWeekPoint[];
  /**
   * What the axis means.
   *
   * "points" is the real thing: absolute reach, comparable across picks.
   * "relative" is the fallback — this term's own daily series scaled against
   * its own peak, which shows the SHAPE of demand but says nothing about
   * how big it is. A brand-new business has one day of signal history and
   * therefore one weekly bucket, so without this the graph on every pick
   * read "not enough history yet" while sixty days of series sat in the
   * database unusable, because series rows drop the source and a value
   * without a source cannot be converted to reach.
   */
  mode: DemandMode;
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
export function buildDemandLine(
  signals: Signal[],
  series: SignalSeriesPoint[] = [],
  now = new Date(),
  weeks = 8,
  /** The business's state, so each read can be weighted by how close to
   * home it was taken. Null leaves every read unweighted. */
  businessRegion: string | null = null,
): DemandLine {
  // Search volume anchored to the Trends index, when the term has both.
  // This is the only input with an absolute level AND weekly resolution, so
  // where it exists it carries the line — see lib/demand/anchor.ts.
  //
  // The series table holds no source, so a term with both a Trends index and
  // a DataForSEO monthly series has them mixed in one list. A Trends value is
  // 0-100 by definition and a volume is a raw count, so the index is what is
  // at or below 100; anchoring on a raw volume would blow the mean apart.
  const volume = signals.find((s) => s.metric_type === "search_volume")?.value ?? null;
  const anchored = new Map(
    anchorTrendsToVolume(
      volume,
      series.filter((p) => p.value <= 100),
      now,
      weeks,
    ).map((w) => [w.day, w.searches]),
  );

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
    const day = dayOf(new Date(end).toISOString());
    const result = demandPoints(
      [...latest.values()].map((s) => ({
        source: s.source,
        metricType: s.metric_type,
        locality: localityFor(s.geo, businessRegion),
        // The monthly volume is replaced by this week's anchored estimate
        // wherever one exists: a flat monthly total repeated across eight
        // buckets is a step, not a trend.
        value:
          s.metric_type === "search_volume" && anchored.has(day)
            ? anchored.get(day)! * 4.345
            : s.value,
      })),
    );
    if (result.points === null) continue;
    buckets.push({ day, points: result.points });
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

  if (buckets.length >= 2) {
    return { weeks: buckets, mode: "points", current, caption: current ? pointsCaption(current) : null, deltaPct };
  }

  // A term read once but anchored across eight weeks: the signal rows cannot
  // fill the line on their own, but the anchored searches are real absolute
  // numbers for every one of those weeks, so the line is still points.
  if (anchored.size >= 2) {
    const ordered = [...anchored.entries()].sort(([a], [b]) => a.localeCompare(b));
    const fromAnchor = ordered.map(([day, searches]) => ({
      day,
      points: pointsFromReach(searches) ?? 0,
    }));
    const prev = fromAnchor[fromAnchor.length - 2].points;
    const last = fromAnchor[fromAnchor.length - 1].points;
    // The caption must describe the LINE. Reporting every source's reach
    // above a search-only line put "about 51 weekly touches" over a line
    // flat at zero — two true numbers that read as a contradiction.
    const searchOnly: DemandPointsResult = {
      points: fromAnchor[fromAnchor.length - 1].points,
      reach: ordered[ordered.length - 1][1],
      contributing: ["dataforseo"],
      indexOnly: [],
      // One surface, but a geo-scoped one — see confidenceFor.
      ...(() => {
        const closest = localityFor(
          signals.find((s) => s.metric_type === "search_volume")?.geo ?? "US",
          businessRegion,
        );
        return { closest, confidence: confidenceFor(["dataforseo"], closest) };
      })(),
    };
    return {
      weeks: fromAnchor,
      mode: "points",
      current: searchOnly,
      caption: pointsCaption(searchOnly),
      deltaPct: prev > 0 ? Math.round(((last - prev) / prev) * 100) : null,
    };
  }

  // Not enough absolute history to draw a comparable line — fall back to the
  // shape, and say that is what it is.
  const relative = weeklyRelative(series, now, weeks);
  if (relative.length >= 2) {
    const prev = relative[relative.length - 2].points;
    const last = relative[relative.length - 1].points;
    return {
      weeks: relative,
      mode: "relative",
      current,
      caption:
        (current ? `${pointsCaption(current)} ` : "") +
        "The line is this term's own movement, scaled against its own busiest week — shape, not size, until there is enough history to place it on the points scale.",
      deltaPct: prev > 0 ? Math.round(((last - prev) / prev) * 100) : null,
    };
  }

  return { weeks: buckets, mode: "points", current, caption: current ? pointsCaption(current) : null, deltaPct };
}

/**
 * The daily series folded into weeks and scaled 0-100 against its own peak.
 *
 * Explicitly self-relative, which is why it is the fallback and never the
 * default: two picks drawn this way can look identical and be orders of
 * magnitude apart. It is still far better than an empty panel — an owner
 * can see whether the thing is climbing.
 */
function weeklyRelative(series: SignalSeriesPoint[], now: Date, weeks: number): DemandWeekPoint[] {
  if (series.length === 0) return [];
  const buckets: { day: string; total: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now.getTime() - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = series.filter((p) => {
      const at = Date.parse(`${p.day}T12:00:00Z`);
      return Number.isFinite(at) && at > start && at <= end;
    });
    if (inWeek.length === 0) continue;
    buckets.push({
      day: dayOf(new Date(end).toISOString()),
      total: inWeek.reduce((sum, p) => sum + p.value, 0) / inWeek.length,
    });
  }
  const peak = Math.max(...buckets.map((b) => b.total), 0);
  if (peak <= 0) return [];
  return buckets.map((b) => ({ day: b.day, points: Math.round((b.total / peak) * 100) }));
}
