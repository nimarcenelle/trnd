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
// Three stages of up to 170s each, plus hand-offs, must fit before a scan reads as abandoned.
const SCAN_STALE_MS = 15 * 60_000;

/** A scan is running, and not one that died mid-way and never reset its flag. */
export function isScanning(brand: Pick<Brand, "scan_status" | "scan_started_at">, now = Date.now()): boolean {
  return brand.scan_status === "running" && Boolean(brand.scan_started_at) && now - Date.parse(brand.scan_started_at!) < SCAN_STALE_MS;
}

export const withinDays = (iso: string, days: number, now = Date.now()) => now - Date.parse(iso) < days * 86_400_000;

/** "ugc testimonial" → "UGC testimonial": a model-written tag, shown in sentence case. */
export const tagLabel = (t: string) => (t.charAt(0).toUpperCase() + t.slice(1)).replace(/\bugc\b/gi, "UGC").replace(/\bdco\b/gi, "DCO");

/** 12345 → "12.3K", 1200000 → "1.2M". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

export const percent = (f: number | null | undefined, digits = 1) => (f === null || f === undefined ? "—" : `${(f * 100).toFixed(digits)}%`);

export const profileUrl = (platform: "instagram" | "tiktok" | "facebook", handle: string) =>
  platform === "instagram" ? `https://www.instagram.com/${handle}/` : platform === "facebook" ? `https://www.facebook.com/${handle}` : `https://www.tiktok.com/@${handle}`;

/** Today as yyyy-mm-dd (UTC), the date the stage and day counts are measured to. */
export const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** The note a rival carries when no Page running Meta ads could be found: not an error, a fact. */
export const NO_PAGE_NOTE = "Not running Meta ads under any Page we could find";
export const isNoPageNote = (note: string | null | undefined) => Boolean(note?.startsWith(NO_PAGE_NOTE));
/** What the search behind a NO_PAGE_NOTE tried, e.g. `"Afina", "afina.com"`, or null. */
export const noPageSearched = (note: string | null | undefined) => note?.split(" Searched: ")[1]?.replace(/\.$/, "") ?? null;
