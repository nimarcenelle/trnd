import { coverage, overallCoverage, type Coverage } from "@/lib/coverage";
import type { Ad, Rival } from "@/lib/db/types";

/** Each company's coverage from its live ads, and the average over the competitors (the brand itself left out). */
export function coverageFor(companies: Rival[], ads: Ad[], inbox: boolean): { byRival: Map<string, Coverage>; overall: ReturnType<typeof overallCoverage> } {
  const byRival = new Map<string, Coverage>();
  for (const r of companies) {
    const live = ads.filter((a) => a.rival_id === r.id && a.active);
    byRival.set(r.id, coverage(r, { activeAds: live.length, engagedAds: live.filter((a) => a.engagement).length, inbox }));
  }
  const overall = overallCoverage(companies.filter((r) => !r.is_self).map((r) => byRival.get(r.id)!.score));
  return { byRival, overall };
}
