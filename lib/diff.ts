import type { Ad } from "@/lib/db/types";

/** An ad still running after this many days has survived several rounds of
 * the rival's own optimization: the best "this works" signal the Ad Library
 * gives, since it shows no spend or results for commercial ads. */
export const PROVEN_DAYS = 21;

export function daysRunning(ad: Pick<Ad, "started_at" | "stopped_at">, today: string): number | null {
  if (!ad.started_at) return null;
  const end = ad.stopped_at ? ad.stopped_at.slice(0, 10) : today;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(ad.started_at)) / 86_400_000));
}

/** Pure: which ads crossed the proven line between the last scan and now. */
export function crossedProven<T extends Pick<Ad, "started_at" | "stopped_at" | "active">>(ads: T[], lastScan: string | null, now: string): T[] {
  if (!lastScan) return [];
  return ads.filter((a) => {
    if (!a.active) return false;
    const nowDays = daysRunning(a, now);
    const thenDays = daysRunning(a, lastScan.slice(0, 10));
    return nowDays !== null && thenDays !== null && nowDays >= PROVEN_DAYS && thenDays < PROVEN_DAYS;
  });
}

/**
 * Where an ad is in a rival's process, from the only signals the Ad Library
 * gives: age and versions. Under two weeks it is a test. Past two weeks with
 * three or more versions, or past a month at all, it is being scaled: they
 * keep funding it and making more of it. In between it is simply running.
 */
export type Stage = "testing" | "scaling" | "running" | "stopped";

export const TESTING_DAYS = 14;
export const SCALING_DAYS = 30;
export const SCALING_VERSIONS = 3;

export function adStage(ad: Pick<Ad, "active" | "started_at" | "stopped_at" | "variants">, today: string): Stage {
  if (!ad.active) return "stopped";
  const days = daysRunning(ad, today) ?? 0;
  if (days < TESTING_DAYS) return "testing";
  if (ad.variants >= SCALING_VERSIONS || days >= SCALING_DAYS) return "scaling";
  return "running";
}
