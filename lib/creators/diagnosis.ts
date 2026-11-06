import { timesNormal, type Normal } from "./stats";

/**
 * The diagnosis the funnel sells: how many of a creator's recent videos never
 * got past their followers, and which of them flopped outright. A breakout is
 * twice their usual views or more; a flop is half or less; everything between
 * stayed with the people who already follow them.
 */

export type Tile = "breakout" | "stuck" | "flop";

export interface Diagnosis {
  /** Oldest first, at most 12. */
  tiles: Tile[];
  n: number;
  breakouts: number;
  /** Videos that never got past their followers: everything that didn't break out. */
  stuck: number;
  flopped: number;
  /** Their weakest video, by how far under their usual it came. */
  worst: { title: string; times: number } | null;
}

export function diagnose(videos: { views: number | null; posted_at: string | null; caption: string | null; hook?: string | null }[], normal: Pick<Normal, "views">): Diagnosis | null {
  const scored = videos
    .filter((v) => v.views !== null)
    .sort((a, b) => Date.parse(b.posted_at ?? "") - Date.parse(a.posted_at ?? ""))
    .slice(0, 12)
    .map((v) => ({ v, x: timesNormal(v.views, normal) }))
    .filter((s): s is { v: (typeof videos)[number]; x: number } => s.x !== null);
  if (scored.length < 3) return null;
  const tile = (x: number): Tile => (x >= 2 ? "breakout" : x <= 0.5 ? "flop" : "stuck");
  const tiles = scored.map((s) => tile(s.x)).reverse();
  const worst = [...scored].sort((a, b) => a.x - b.x)[0];
  const breakouts = tiles.filter((t) => t === "breakout").length;
  return {
    tiles,
    n: tiles.length,
    breakouts,
    stuck: tiles.length - breakouts,
    flopped: tiles.filter((t) => t === "flop").length,
    worst: worst ? { title: (worst.v.caption || worst.v.hook || "Untitled").replace(/\s+/g, " ").replace(/#\S+/g, "").trim().slice(0, 80) || "Untitled", times: worst.x } : null,
  };
}

/** The one thing killing the posts when there is no written diagnosis, from the numbers alone. */
export function killerFromNumbers(d: Diagnosis): string {
  if (d.breakouts === 0) return "None of your videos are reaching past the people who already follow you.";
  if (d.flopped >= 4) return `${d.flopped} of your videos lost even your regulars. Something in how they open is pushing people away.`;
  if (d.breakouts === 1) return "You had one hit and didn't repeat it. The rest of your videos don't do what it did.";
  return "Most of your videos stop at your followers. Your hits do something the rest don't.";
}
