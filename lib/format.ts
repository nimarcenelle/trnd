import type { Ad, Brand } from "@/lib/db/types";

/** The ad's public Ad Library page: the link that never expires. */
export const libraryLink = (archiveId: string) => `https://www.facebook.com/ads/library/?id=${encodeURIComponent(archiveId)}`;

export function daysRunningOf(ad: Pick<Ad, "started_at" | "stopped_at">, now = Date.now()): number | null {
  if (!ad.started_at) return null;
  const end = ad.stopped_at ? Date.parse(ad.stopped_at) : now;
  return Math.max(0, Math.floor((end - Date.parse(ad.started_at)) / 86_400_000));
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** A scan longer than this died with its function (the limit is 5 minutes). */
const SCAN_STALE_MS = 10 * 60_000;

/** A scan is running, and not one that died mid-way and never reset its flag. */
export function isScanning(brand: Pick<Brand, "scan_status" | "scan_started_at">, now = Date.now()): boolean {
  return brand.scan_status === "running" && Boolean(brand.scan_started_at) && now - Date.parse(brand.scan_started_at!) < SCAN_STALE_MS;
}
