import type { RivalCandidate } from "@/lib/ai/analyze";
import { MAX_RIVALS, type Rival, type SpareCandidate } from "@/lib/db/types";

/**
 * Which of the model's candidates become the brand's rivals. Setup seats
 * the most direct ten at once (the model's read takes a minute and nobody
 * waits longer at a form), keeps the rest as spares, and the first scan,
 * which reads every seated brand's ads anyway, swaps a seat whose brand
 * runs no Meta ads for the next spare. Jolie's first list carried
 * Culligan, Aquasana and WaterChef (whole-home filtration) and Vitaclean
 * (no ads) beside the filtered showerhead brands it competes with.
 */

/** The seats, most direct first, the model's own order among equals. Below directness 3 a brand only fills a seat left over. */
export function rankCandidates<T extends { directness: number }>(candidates: T[], seats = MAX_RIVALS): { seated: T[]; spares: T[] } {
  const indexed = candidates.map((c, i) => ({ c, i }));
  const sorted = [...indexed].sort((a, b) => b.c.directness - a.c.directness || a.i - b.i);
  const direct = sorted.filter(({ c }) => c.directness >= 3);
  const rest = sorted.filter(({ c }) => c.directness < 3);
  const ordered = [...direct, ...rest].map(({ c }) => c);
  return { seated: ordered.slice(0, seats), spares: ordered.slice(seats) };
}

export const toSpare = (c: RivalCandidate): SpareCandidate => ({ name: c.name, website: c.website, reason: c.reason, directness: c.directness });

/**
 * After a first read: which seated rivals to swap out, and for whom. A
 * rival the model seated that turned out to have no Page or no active ads
 * gives its seat to the most direct spare, one spare each. Rivals the owner
 * added themselves are never swapped.
 */
export function planSwaps(
  rivals: Pick<Rival, "id" | "name" | "source" | "page_id">[],
  adsOf: (rivalId: string) => number,
  spares: SpareCandidate[],
): { out: Pick<Rival, "id" | "name">; in: SpareCandidate }[] {
  const idle = rivals.filter((r) => r.source === "ai" && (!r.page_id || adsOf(r.id) === 0));
  const queue = [...spares].sort((a, b) => b.directness - a.directness);
  const swaps: { out: Pick<Rival, "id" | "name">; in: SpareCandidate }[] = [];
  for (const r of idle) {
    const next = queue.shift();
    if (!next) break;
    swaps.push({ out: { id: r.id, name: r.name }, in: next });
  }
  return swaps;
}
