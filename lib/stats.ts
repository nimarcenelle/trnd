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

/** How the brand reads against its rivals on one angle: they lean on it and it doesn't, the reverse, or about even. */
export type AngleRead = "gap" | "lead" | "par";

export interface AngleRow {
  angle: string;
  /** Shares of live ads, 0-1: the brand's, and the average rival's. */
  you: number;
  rivals: number;
  /** The rival that leans on it hardest. */
  top: { name: string; share: number; count: number } | null;
  read: AngleRead;
}

/** A gap or a lead is a difference of this many points of share or more. */
export const ANGLE_GAP = 0.1;

function liveAngles(ads: Pick<Ad, "angle" | "active">[]): { live: number; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  let live = 0;
  for (const a of ads) {
    if (!a.active) continue;
    live++;
    if (a.angle) counts.set(a.angle.toLowerCase(), (counts.get(a.angle.toLowerCase()) ?? 0) + 1);
  }
  return { live, counts };
}

/**
 * Each angle's share of live ads, the brand's against the average of the
 * rivals running ads, the angles used most across everyone first. Shares,
 * not counts, so a rival with 200 ads does not drown one with 20.
 */
export function angleShares(you: Pick<Ad, "angle" | "active">[], rivals: { name: string; ads: Pick<Ad, "angle" | "active">[] }[], top = 8): AngleRow[] {
  const mine = liveAngles(you);
  const theirs = rivals.map((r) => ({ name: r.name, ...liveAngles(r.ads) })).filter((r) => r.live > 0);
  const total = new Map<string, number>();
  for (const c of [mine, ...theirs]) for (const [k, n] of c.counts) total.set(k, (total.get(k) ?? 0) + n);
  const share = (c: { live: number; counts: Map<string, number> }, k: string) => (c.live ? (c.counts.get(k) ?? 0) / c.live : 0);
  return [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([angle]) => {
      const you = share(mine, angle);
      const rivalsAvg = theirs.length ? theirs.reduce((s, r) => s + share(r, angle), 0) / theirs.length : 0;
      const best = theirs.filter((r) => r.counts.get(angle)).sort((a, b) => share(b, angle) - share(a, angle))[0];
      const diff = you - rivalsAvg;
      return {
        angle,
        you,
        rivals: rivalsAvg,
        top: best ? { name: best.name, share: share(best, angle), count: best.counts.get(angle) ?? 0 } : null,
        read: diff <= -ANGLE_GAP ? "gap" : diff >= ANGLE_GAP ? "lead" : "par",
      };
    });
}

/** The angle most of these ads share, lowercased, live or not; null when none is tagged. */
export function leadAngle(ads: Pick<Ad, "angle">[]): string | null {
  return angleMix(ads.map((a) => ({ angle: a.angle, active: true })), 1)[0]?.[0] ?? null;
}
