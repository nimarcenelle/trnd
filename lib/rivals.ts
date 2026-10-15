import "server-only";

import type { RivalCandidate } from "@/lib/ai/analyze";
import { pickRivalPage, type PageMatch } from "@/lib/adlibrary/match";
import { scrapeAds } from "@/lib/adlibrary/scrape";
import { MAX_RIVALS } from "@/lib/db/types";

/**
 * Which of the model's candidates become the brand's rivals. The model
 * names who is comparable; the Ad Library says who is actually advertising.
 * Both count: a direct competitor with live Meta ads outranks an adjacent
 * giant, and an adjacent brand only fills a seat when nothing closer runs
 * ads. Jolie's first list carried Culligan, Aquasana and WaterChef
 * (whole-home filtration) and Vitaclean (no ads) beside the filtered
 * showerhead brands it actually competes with.
 */

export interface CheckedCandidate extends RivalCandidate {
  /** The candidate's Page, when a keyword search surely found it. */
  page: PageMatch | null;
  /** Active ads the search showed from that Page; null when the check did not run or finish. */
  ads: number | null;
}

/** Time the checks get before the setup page shows the list; unchecked candidates keep the model's rank. */
export const CHECK_BUDGET_MS = 45_000;
const CHECK_CONCURRENCY = 4;
const CHECK_ADS = 30;

/** Ask the Ad Library whether each candidate advertises, a few at a time, until the budget is spent. */
export async function checkCandidates(candidates: RivalCandidate[], budgetMs = CHECK_BUDGET_MS): Promise<CheckedCandidate[]> {
  const deadline = Date.now() + budgetMs;
  const out: CheckedCandidate[] = candidates.map((c) => ({ ...c, page: null, ads: null }));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CHECK_CONCURRENCY, out.length) }, async () => {
      while (next < out.length && Date.now() < deadline) {
        const i = next++;
        const c = out[i];
        try {
          const { ads } = await scrapeAds({ query: c.name }, CHECK_ADS);
          const page = pickRivalPage({ name: c.name, website: c.website || null }, ads);
          c.page = page;
          c.ads = page ? ads.filter((a) => a.pageId === page.pageId).length : 0;
        } catch {
          c.ads = null;
        }
      }
    }),
  );
  return out;
}

/**
 * The seats, in order: directness first, then whether ads were seen, then
 * the model's own order. A candidate the check never reached keeps its
 * place by directness alone. Below directness 3 a brand only fills a seat
 * left over.
 */
export function rankCandidates<T extends { directness: number; ads?: number | null }>(candidates: T[], seats = MAX_RIVALS): T[] {
  const indexed = candidates.map((c, i) => ({ c, i }));
  const score = (c: T) => (c.ads === null || c.ads === undefined ? 0.5 : c.ads > 0 ? 1 : 0);
  const sorted = [...indexed].sort((a, b) => b.c.directness - a.c.directness || score(b.c) - score(a.c) || a.i - b.i);
  const direct = sorted.filter(({ c }) => c.directness >= 3 && (c.ads === null || c.ads === undefined || c.ads > 0));
  const rest = sorted.filter((x) => !direct.includes(x));
  return [...direct, ...rest].slice(0, seats).map(({ c }) => c);
}
