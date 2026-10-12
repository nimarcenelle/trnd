import type { Ad } from "@/lib/db/types";

const WEEK = 7 * 86_400_000;

/**
 * Ads started per week, oldest first, the last bucket being this week. Counts
 * every ad we have seen, live or killed; an ad killed before we started
 * watching is invisible, so early weeks can read low.
 */
export function weeklyLaunches(ads: Pick<Ad, "started_at">[], weeks: number, now = Date.now()): number[] {
  const out = new Array(weeks).fill(0);
  for (const a of ads) {
    if (!a.started_at) continue;
    const ago = Math.floor((now - Date.parse(a.started_at)) / WEEK);
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago]++;
  }
  return out;
}

/** Live ads per angle, most-used first. */
export function angleMix(ads: Pick<Ad, "angle" | "active">[], top = 6): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of ads) if (a.active && a.angle) counts.set(a.angle.toLowerCase(), (counts.get(a.angle.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
}
