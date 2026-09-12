import type { SignalSeriesPoint } from "@/lib/db/types";

/**
 * Give the Google Trends index a size.
 *
 * Trends is the most abundant signal TRND holds and it contributes nothing
 * to the demand score, because its index is scaled against the term's own
 * busiest day: "63" is a shape, not a quantity, and inventing a number of
 * people from it would be exactly the dishonesty the points module exists
 * to remove.
 *
 * Search volume fixes that. DataForSEO returns real monthly searches for
 * the same term, which is a LEVEL with no weekly resolution — twelve
 * monthly totals cannot show that something moved last Tuesday. Trends is
 * the opposite: daily resolution, no level.
 *
 * Put together they are one usable series. The monthly volume sets the
 * area under the curve and the Trends index distributes it across the
 * weeks, so a term reads in real weekly searches that still move when
 * demand moves. Neither source can do this alone, which is why the score
 * ran on short-form views until now.
 */

export interface AnchoredWeek {
  /** Week-ending day, yyyy-mm-dd. */
  day: string;
  /** Estimated searches in that week. */
  searches: number;
}

const DAY_MS = 86400_000;

/**
 * @param monthlyVolume real searches per month for the term, from DataForSEO.
 * @param index the Trends daily series for the same term and geo.
 * @param weeks how many weekly buckets to produce, most recent last.
 *
 * Returns [] when either half is missing — an anchor with nothing to anchor,
 * or a level with no shape, is not a weekly series and must not pretend to
 * be one.
 */
export function anchorTrendsToVolume(
  monthlyVolume: number | null,
  index: Pick<SignalSeriesPoint, "day" | "value">[],
  now = new Date(),
  weeks = 8,
): AnchoredWeek[] {
  if (!monthlyVolume || !Number.isFinite(monthlyVolume) || monthlyVolume <= 0) return [];
  if (index.length === 0) return [];

  const buckets: { day: string; mean: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now.getTime() - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = index.filter((p) => {
      const at = Date.parse(`${p.day}T12:00:00Z`);
      return Number.isFinite(at) && at > start && at <= end;
    });
    if (inWeek.length === 0) continue;
    buckets.push({
      day: new Date(end).toISOString().slice(0, 10),
      mean: inWeek.reduce((sum, p) => sum + p.value, 0) / inWeek.length,
    });
  }
  if (buckets.length === 0) return [];

  // The index is proportional to searches, not equal to them. Its mean over
  // the window corresponds to the average week, and the average week is the
  // monthly volume spread over the weeks in a month — so that ratio converts
  // every bucket. A window that is entirely flat at zero has no shape to
  // distribute and yields nothing rather than a row of zeroes.
  const meanIndex = buckets.reduce((sum, b) => sum + b.mean, 0) / buckets.length;
  if (meanIndex <= 0) return [];
  const weeklyAverage = monthlyVolume / 4.345;

  // A week whose index is flat at zero is Trends failing to resolve a
  // long-tail term, not demand vanishing for seven days. Drawing it as zero
  // puts a cliff in the middle of a line that has real volume behind it, so
  // the week is omitted — a gap says "not measured", a zero says "nobody".
  return buckets
    .filter((b) => b.mean > 0)
    .map((b) => ({
      day: b.day,
      searches: Math.max(0, Math.round((b.mean / meanIndex) * weeklyAverage)),
    }));
}
