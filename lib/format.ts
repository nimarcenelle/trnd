import type { Creator } from "@/lib/db/types";

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
export function isScanning(c: Pick<Creator, "scan_status" | "scan_started_at">, now = Date.now()): boolean {
  return c.scan_status === "running" && Boolean(c.scan_started_at) && now - Date.parse(c.scan_started_at!) < SCAN_STALE_MS;
}

export const withinDays = (iso: string, days: number, now = Date.now()) => now - Date.parse(iso) < days * 86_400_000;

/** 12345 → "12K", 9500 → "9,500", 1200000 → "1.2M", 36000 → "36K". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const a = Math.abs(n);
  // One decimal below 10 (2.4M, 9.5K), none above, and never a trailing ".0".
  const short = (x: number, unit: string) => `${x.toFixed(Math.abs(x) >= 10 ? 0 : 1).replace(/\.0$/, "")}${unit}`;
  if (a >= 1e9) return short(n / 1e9, "B");
  if (a >= 1e6) return short(n / 1e6, "M");
  if (a >= 1e4) return short(n / 1e3, "K");
  return n.toLocaleString("en-US");
}

/** How many times something: 7.3 → "7.3×", 42.6 → "43×", 1796.4 → "1,796×". */
export function times(x: number): string {
  // A video far under its usual reads "<0.1×", never "0×": it got views, just very few.
  if (x > 0 && x < 0.05) return "<0.1×";
  const tenths = Math.round(x * 10) / 10;
  const n = Math.abs(tenths) < 10 ? tenths : Math.round(x);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}×`;
}

/** +1,234 / −56: a change with its sign. */
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${compact(Math.abs(n))}`;

export const profileUrl = (handle: string) => `https://www.tiktok.com/@${handle}`;

/** Today as yyyy-mm-dd (UTC), the date snapshots are filed under. */
export const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** "Mar 4" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** 44 → "44s", 75 → "1m15s". */
export const duration = (s: number | null) => (s === null ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`);

/** "October 31": the date `days` from now. */
export const dateIn = (days: number, now = Date.now()) => new Date(now + days * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/**
 * Text safe to put in JSON for another service: a lone surrogate half (an
 * emoji cut in two by a character-count trim) serializes to an escape that
 * OpenAI and Postgres both reject as invalid JSON.
 */
export function safeText(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "").replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/**
 * A video's caption as a title: hashtags at the start and end stripped, then cut
 * to 60 characters with an ellipsis. A caption that is only hashtags shows its
 * first three.
 */
export function videoTitle(text: string | null | undefined, max = 60): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  const tags = s.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const core = s
    .replace(/^(?:#[\p{L}\p{N}_]*\s*)+/u, "")
    .replace(/(?:\s*#[\p{L}\p{N}_]*)+$/u, "")
    .trim();
  if (!core) return tags.slice(0, 3).join(" ");
  return core.length > max ? `${core.slice(0, max).trimEnd()}…` : core;
}

/** How often someone posts, in words: "twice a week", "about once every 3 weeks", "less than once a month". */
export function cadence(perWeek: number): string {
  if (perWeek >= 2.5) return `${Math.round(perWeek)} times a week`;
  if (perWeek >= 1.5) return "twice a week";
  if (perWeek >= 0.75) return "once a week";
  const weeks = Math.round(1 / perWeek);
  return weeks > 4 ? "less than once a month" : `about once every ${weeks} weeks`;
}

