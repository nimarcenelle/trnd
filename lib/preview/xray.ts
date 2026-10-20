import { normalOf, SETTLE_HOURS, timesNormal } from "@/lib/creators/stats";
import type { ReadVideo } from "@/lib/tiktok/read";

/**
 * The account X-ray: the creator's own grid, newest first as on their profile,
 * each tile read against their usual views. Above usual tints by how far it
 * beat it; below usual dims softly (never red: it is a read, not a failure);
 * the one or two biggest breakouts lift out with their real ×.
 */

export const XRAY_TILES = 24;
/** A video at this many times the usual or more is a breakout, as in readVideo's "do more". */
export const BREAKOUT_X = 2;

export type XrayTone = "above" | "usual" | "below" | "new" | "unknown";

export interface XrayTile {
  id: string;
  url: string | null;
  cover: string | null;
  views: number | null;
  /** Times their usual views, one decimal; null without views or a usual. */
  x: number | null;
  tone: XrayTone;
  /** How strong the tint (above) or the dimming (below) is, 0 to 1. */
  strength: number;
  /** One of the one or two biggest breakouts. */
  lift: boolean;
}

export interface Xray {
  tiles: XrayTile[];
  /** Their usual views, the median of their settled videos. */
  usual: number | null;
  lifted: XrayTile[];
}

/** 1× their usual is 0, 8× or more is 1, on a log scale, so a 3× and a 30× don't look alike only at the top. */
export function aboveStrength(x: number): number {
  return Math.max(0, Math.min(1, Math.log2(Math.max(x, 1)) / 3));
}

/** Half their usual or less dims fully; at their usual, not at all. */
export function belowStrength(x: number): number {
  return Math.max(0, Math.min(1, (1 - x) / 0.5));
}

/** Within this band of their usual, a video reads as usual: no tint. */
const USUAL_BAND = [0.8, 1.25] as const;

export function toneOf(x: number | null, settled: boolean): { tone: XrayTone; strength: number } {
  if (!settled) return { tone: "new", strength: 0 };
  if (x === null) return { tone: "unknown", strength: 0 };
  if (x >= USUAL_BAND[1]) return { tone: "above", strength: aboveStrength(x) };
  if (x <= USUAL_BAND[0]) return { tone: "below", strength: belowStrength(x) };
  return { tone: "usual", strength: 0 };
}

const posted = (v: ReadVideo) => (v.postedAt ? Date.parse(v.postedAt) : 0);

export function xrayOf(videos: ReadVideo[], now = Date.now()): Xray {
  const grid = [...videos].sort((a, b) => posted(b) - posted(a)).slice(0, XRAY_TILES);
  const normal = normalOf(
    videos.map((v) => ({ views: v.views, saves: v.saves, comments: v.comments, posted_at: v.postedAt })),
    now,
  );
  const tiles: XrayTile[] = grid.map((v) => {
    const settled = !v.postedAt || now - Date.parse(v.postedAt) >= SETTLE_HOURS * 3_600_000;
    const x = timesNormal(v.views, normal);
    return { id: v.videoId, url: v.url, cover: v.storedCover ?? null, views: v.views, x, ...toneOf(x, settled), lift: false };
  });
  // A video still collecting views is not called a breakout yet.
  const best = tiles
    .filter((t) => t.tone === "above" && t.x !== null && t.x >= BREAKOUT_X)
    .sort((a, b) => b.x! - a.x!)
    .slice(0, 2);
  for (const t of best) t.lift = true;
  return { tiles, usual: normal.views, lifted: best };
}
