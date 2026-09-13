import type { PickRunStatus } from "@/lib/db/types";

import type { MetricDirection } from "./format";

/**
 * The small decisions behind the ranked list and the Campaigns runs, kept
 * pure so they are tested rather than eyeballed. Metric and bet text are not
 * here: those come from lib/picks/format.ts so the row and the detail page
 * say the same thing character for character.
 */

export type RunChipTone = "amber" | "mint" | "faint";

/** The status chip a pick earns once someone ran it. No run, no chip: the
 * list never labels a pick nobody acted on. */
export function runChip(status: PickRunStatus | null | undefined): { label: string; tone: RunChipTone } | null {
  switch (status) {
    case "running":
      return { label: "Running", tone: "amber" };
    case "completed":
      return { label: "Completed", tone: "mint" };
    case "killed":
      return { label: "Killed", tone: "faint" };
    default:
      return null;
  }
}

/** One glyph for the metric's direction. Flat gets a level arrow rather than
 * nothing, so every row's metric column lines up. */
export function arrowGlyph(direction: MetricDirection): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

/**
 * A ceiling on the finding before it reaches the row. The row clips to one
 * line with CSS; this only keeps a runaway paragraph from shipping whole.
 * Cuts on a word, drops dangling punctuation, and ends with an ellipsis.
 */
export function truncateFinding(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  // A single enormous word still gets cut; a sentence is cut on a word.
  const head = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:.!?"'(-]+$/, "")}…`;
}

function day(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sep 14 – Sep 20" for the Monday week key. */
export function weekRangeLabel(week: string): string {
  const start = new Date(`${week}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${day(start)} – ${day(end)}`;
}

/** "Sep 14" from a timestamp. */
export function shortDate(iso: string): string {
  return day(new Date(iso));
}

/**
 * The old dashboard paged picks with `?pick=n` (1-based). Returns the
 * 0-based index when it names a pick that exists, else null, so an old
 * bookmark lands on that pick and a stale one lands on the list.
 */
export function legacyPickIndex(param: string | string[] | undefined, count: number): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const n = Number.parseInt(raw, 10);
  return n >= 1 && n <= count ? n - 1 : null;
}

/** What the list page remembers about the week's generation kick. */
export interface GenerationEntry {
  state: "running" | "done";
  /** ms epoch the state was set. */
  at: number;
  /** Ready picks the job wrote, once done. */
  ready?: number;
}

/** A job that has said nothing for this long died with its process. */
export const GENERATION_STALE_MS = 15 * 60_000;
/** A finished job that wrote nothing ready is not retried sooner than this.
 * The cron owns the week after that; this is only the first-visit path. */
export const GENERATION_SETTLE_MS = 6 * 3_600_000;

/**
 * Whether the list page should kick generation, keep waiting on a kick, or
 * accept the week as empty. Only called when the week shows no ready picks.
 * Without it a week the job wrote only drafts for would regenerate on every
 * silent refresh, a model bill on a timer.
 */
export function generationDecision(entry: GenerationEntry | undefined, now: number): "kick" | "wait" | "settled" {
  if (!entry) return "kick";
  if (entry.state === "running") return now - entry.at < GENERATION_STALE_MS ? "wait" : "kick";
  return now - entry.at < GENERATION_SETTLE_MS ? "settled" : "kick";
}

/** True when a keyed background job was not kicked inside the window. */
export function dueForKick(lastAt: number | undefined, now: number, windowMs: number): boolean {
  return lastAt === undefined || now - lastAt >= windowMs;
}
