import type { AdHistorySource, BrandPick, NewAdHistory, PickRun, PickRunStatus, PickScript, RunVerdict } from "@/lib/db/types";
import type { GradeLetter } from "@/lib/scoring/model";

import type { MetricDirection } from "./format";
import { gradeTone, readGrade, type GradeTone } from "./grade-view";

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
    case "planned":
      return { label: "In production", tone: "amber" };
    case "running":
      return { label: "Launched", tone: "amber" };
    case "completed":
      return { label: "Completed", tone: "mint" };
    case "killed":
      return { label: "Stopped", tone: "faint" };
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

/* -------------------------------- empty week -------------------------------- */

/**
 * What an empty week says. "Nothing worth spending on" is only true when the
 * signals were read and every candidate still held; when half of them had
 * nothing to read (no ad results on file, no competitors named) the honest
 * line is which half, and where to fix it. Pure, so the wording is tested.
 */
export function emptyWeekLine(input: {
  held: number;
  adHistoryRows: number;
  competitors: number;
  where: string;
  category: string;
}): { line: string; missing: { label: string; href: string }[] } {
  const missing: { label: string; href: string }[] = [];
  if (input.adHistoryRows === 0) missing.push({ label: "Add an Ads Manager export", href: "/app/settings#ads" });
  if (input.competitors === 0) missing.push({ label: "Name your competitors", href: "/app/settings" });
  if (input.held > 0 && missing.length > 0) {
    const what =
      missing.length === 2
        ? "no ad results are on file and no competitors are named, so the Brand and Competitive signals had nothing to read and the grade rested on the market alone"
        : input.adHistoryRows === 0
          ? "no ad results are on file, so the Brand signal had nothing to read"
          : "no competitors are named, so the Competitive signal had nothing to read";
    return {
      line: `${input.held} ${input.held === 1 ? "candidate was" : "candidates were"} graded and every one held: ${what}. The week is graded again on the next daily read once that lands.`,
      missing,
    };
  }
  if (input.held > 0) {
    return { line: `${input.held} ${input.held === 1 ? "candidate was" : "candidates were"} graded and every one held. The daily read keeps going; new tests land on Monday.`, missing };
  }
  return { line: `This week's reads for ${input.category} ${input.where} did not turn up a candidate. The daily read keeps going; new tests land on Monday.`, missing };
}

/* ---------------------------------- grade ---------------------------------- */

/** The row's grade chip: the letter shows, the meaning is its description.
 * Null on a pick written before the grade existed. */
export function gradeChip(
  pick: Partial<Pick<BrandPick, "grade" | "grade_score" | "signal_scores">>,
): { letter: GradeLetter; meaning: string; description: string; tone: GradeTone } | null {
  const grade = readGrade(pick);
  if (!grade) return null;
  return {
    letter: grade.letter,
    meaning: grade.meaning,
    description: `Grade ${grade.letter}: ${grade.meaning}`,
    tone: gradeTone(grade.letter),
  };
}

/* ------------------------------- run results ------------------------------- */
// The learning loop, v1: when an owner closes a run they can say what it did.
// Every field is optional. What they give is stored on the run, and when it
// includes delivery (impressions or clicks) it also lands in the brand's own
// ad history, the baseline the Brand signal ranks against.

export interface RunResults {
  spend_usd: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  revenue_usd: number | null;
}

export const RUN_RESULT_FIELDS = [
  { name: "spend_usd", label: "Spend (USD)", money: true },
  { name: "impressions", label: "Impressions", money: false },
  { name: "clicks", label: "Clicks", money: false },
  { name: "conversions", label: "Purchases", money: false },
  { name: "revenue_usd", label: "Revenue (USD)", money: true },
] as const satisfies readonly { name: keyof RunResults; label: string; money: boolean }[];

/** Anything with FormData's `get`, so the rules are tested without a request. */
export interface FormLike {
  get(name: string): unknown;
}

/**
 * Reads the five result fields. Blank is null. "$1,250.50" and "12,000" are
 * read as numbers; a negative, a non-number, or a fractional count is an
 * error naming the field, and clicks can't exceed impressions.
 */
/** The verdict radio on the results form: "won", "lost", or nothing (the
 * numbers decide). Anything else is nothing. */
export function parseVerdict(formData: FormData): RunVerdict | null {
  const v = formData.get("verdict");
  return v === "won" || v === "lost" ? v : null;
}

export function parseRunResults(form: FormLike): { ok: true; results: RunResults } | { ok: false; error: string } {
  const results: RunResults = { spend_usd: null, impressions: null, clicks: null, conversions: null, revenue_usd: null };
  for (const field of RUN_RESULT_FIELDS) {
    const raw = form.get(field.name);
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "string") return { ok: false, error: `${field.label} has to be a number.` };
    const cleaned = raw.trim().replace(/[$,\s]/g, "");
    if (cleaned === "") continue;
    const n = /^-?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
    if (!Number.isFinite(n)) return { ok: false, error: `${field.label} has to be a number.` };
    if (n < 0) return { ok: false, error: `${field.label} can't be negative.` };
    if (!field.money && !Number.isInteger(n)) return { ok: false, error: `${field.label} has to be a whole number.` };
    results[field.name] = field.money ? Math.round(n * 100) / 100 : n;
  }
  if (results.impressions !== null && results.clicks !== null && results.clicks > results.impressions) {
    return { ok: false, error: "Clicks can't be more than impressions." };
  }
  return { ok: true, results };
}

export interface RunRates {
  /** clicks / impressions */
  ctr: number | null;
  /** conversions / clicks */
  cvr: number | null;
  /** revenue / spend */
  roas: number | null;
}

const ratio = (num: number | null | undefined, den: number | null | undefined): number | null =>
  typeof num === "number" && typeof den === "number" && Number.isFinite(num) && Number.isFinite(den) && den > 0
    ? num / den
    : null;

export function runRates(run: Partial<RunResults>): RunRates {
  return {
    ctr: ratio(run.clicks, run.impressions),
    cvr: ratio(run.conversions, run.clicks),
    roas: ratio(run.revenue_usd, run.spend_usd),
  };
}

function pct(n: number): string {
  const p = n * 100;
  return `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`;
}

/** "CTR 2.1% · CVR 3.3% · ROAS 2.4x", only the rates the numbers support. */
export function runRatesLine(run: Partial<RunResults>): string | null {
  const r = runRates(run);
  const parts = [
    r.ctr === null ? null : `CTR ${pct(r.ctr)}`,
    r.cvr === null ? null : `CVR ${pct(r.cvr)}`,
    r.roas === null ? null : `ROAS ${Math.round(r.roas * 10) / 10}x`,
  ].filter((p): p is string => p !== null);
  return parts.length ? parts.join(" · ") : null;
}

/** yyyy-mm-dd in UTC. */
function isoDay(d: Date | string): string {
  return (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10);
}

/** The campaign name a run's ad-history row carries, so its own row can be
 * told apart from the rest of the account when the run is judged. */
export function runCampaignName(pick: Pick<BrandPick, "term">): string {
  return `TRND pick: ${pick.term.trim()}`;
}

/**
 * What the brand names the ad in Ads Manager so its results find their way
 * back to this test: the account history sync and an uploaded export are
 * matched on it (lib/ads/run-sync.ts). The concept's title, because that
 * is what the creative team calls the idea; the research term on a pick
 * written before titles existed.
 */
export function runTrackingName(pick: Pick<BrandPick, "term"> & { concept_title?: string | null }): string {
  const name = (pick.concept_title ?? pick.term).replace(/\s+/g, " ").trim().slice(0, 80);
  return `TRND: ${name}`;
}

const numeric = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * The results form leaves blank what the owner does not know. A run the
 * account sync already filled must not lose those numbers to a blank: the
 * owner's figure wins where they gave one, the synced figure stays where
 * they did not.
 */
export function withSyncedNumbers(results: RunResults, run: Partial<RunResults>): RunResults {
  return {
    spend_usd: results.spend_usd ?? numeric(run.spend_usd),
    impressions: results.impressions ?? numeric(run.impressions),
    clicks: results.clicks ?? numeric(run.clicks),
    conversions: results.conversions ?? numeric(run.conversions),
    revenue_usd: results.revenue_usd ?? numeric(run.revenue_usd),
  };
}

/**
 * The ad-history row a completed run becomes, or null when the owner gave no
 * delivery numbers (impressions or clicks): a row with neither teaches the
 * Brand baseline nothing. Its identity is the pick and the run's start day,
 * so a repeat submit upserts the same row. A run the daily sync closed is
 * written as "meta_api", the source the account history sync replaces, so
 * the same ad never counts twice once the account's own row arrives.
 */
export function runAdHistoryRow(input: {
  pick: Pick<BrandPick, "business_id" | "term" | "bet_what">;
  scripts: Pick<PickScript, "position" | "variant_label" | "hook">[];
  run: Pick<PickRun, "started_at">;
  results: RunResults;
  endedAt: Date | null;
  source?: Extract<AdHistorySource, "manual" | "meta_api">;
}): NewAdHistory | null {
  const { pick, run, results } = input;
  if (results.impressions === null && results.clicks === null) return null;
  const first = [...input.scripts].sort((a, b) => a.position - b.position)[0];
  const term = pick.term.trim();
  const copy = [pick.bet_what?.trim(), first?.hook?.trim()].filter(Boolean).join("\n");
  const started = new Date(run.started_at);
  return {
    business_id: pick.business_id,
    platform: "meta",
    campaign_name: runCampaignName(pick),
    ad_name: first?.variant_label?.trim() || term,
    copy: copy || null,
    impressions: results.impressions,
    clicks: results.clicks,
    spend_cents: results.spend_usd === null ? null : Math.round(results.spend_usd * 100),
    results: results.conversions,
    ctr: ratio(results.clicks, results.impressions),
    started_on: Number.isNaN(started.getTime()) ? null : isoDay(started),
    ended_on: input.endedAt ? isoDay(input.endedAt) : null,
    source: input.source ?? "manual",
  };
}
