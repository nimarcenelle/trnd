import type { BrandPick, PickRun } from "@/lib/db/types";
import type { GradeLetter } from "@/lib/scoring/model";

import { runOutcome, type OutcomeContext, type RunOutcome } from "./outcome";

/**
 * The track record: how the picks this brand actually ran turned out. The
 * one number the product is judged on is the hit rate, won over scored,
 * and it is only ever computed from runs that ended with a verdict or with
 * numbers. Open runs and runs closed without either are counted, never
 * scored, so the rate can't be flattered by silence.
 */

export const GRADE_ORDER: GradeLetter[] = ["A+", "A", "B+", "B", "C", "Hold"];

export interface TrackRow {
  runId: string;
  pickId: string;
  term: string;
  grade: GradeLetter | null;
  startedAt: string;
  endedAt: string | null;
  outcome: RunOutcome;
  reason: string;
  spendUsd: number | null;
}

export interface GradeRecord {
  letter: GradeLetter;
  runs: number;
  scored: number;
  won: number;
}

export interface TrackPoint {
  /** The day the run ended. */
  day: string;
  won: number;
  scored: number;
  /** Cumulative hit rate after this run, 0-1. */
  rate: number;
}

export interface TrackRecord {
  runs: number;
  open: number;
  scored: number;
  won: number;
  lost: number;
  unscored: number;
  /** Won over scored, 0-1; null until one run is scored. */
  hitRate: number | null;
  byGrade: GradeRecord[];
  /** One point per scored run in the order they ended. */
  series: TrackPoint[];
  /** Every run, newest first. */
  rows: TrackRow[];
}

const LETTERS = new Set<string>(GRADE_ORDER);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function gradeLetterOf(pick: Pick<BrandPick, "grade">): GradeLetter | null {
  return pick.grade && LETTERS.has(pick.grade) ? (pick.grade as GradeLetter) : null;
}

export function buildTrackRecord(runs: { run: PickRun; pick: BrandPick }[], ctx: OutcomeContext = {}): TrackRecord {
  const rows: TrackRow[] = runs
    .map(({ run, pick }) => {
      const read = runOutcome(run, ctx);
      return {
        runId: run.id,
        pickId: pick.id,
        // The concept's own name where it has one; the research term on older picks.
        term: pick.concept_title ?? pick.term,
        grade: gradeLetterOf(pick),
        startedAt: run.started_at,
        endedAt: run.ended_at,
        outcome: read.outcome,
        reason: read.reason,
        spendUsd: num(run.spend_usd),
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const count = (o: RunOutcome) => rows.filter((r) => r.outcome === o).length;
  const won = count("won");
  const lost = count("lost");
  const scored = won + lost;

  const byGrade: GradeRecord[] = GRADE_ORDER.map((letter) => {
    const mine = rows.filter((r) => r.grade === letter);
    const w = mine.filter((r) => r.outcome === "won").length;
    const l = mine.filter((r) => r.outcome === "lost").length;
    return { letter, runs: mine.length, scored: w + l, won: w };
  }).filter((g) => g.runs > 0);

  const ended = rows
    .filter((r) => (r.outcome === "won" || r.outcome === "lost") && r.endedAt)
    .sort((a, b) => (a.endedAt as string).localeCompare(b.endedAt as string));
  const series: TrackPoint[] = [];
  let w = 0;
  let s = 0;
  for (const r of ended) {
    s += 1;
    if (r.outcome === "won") w += 1;
    series.push({ day: (r.endedAt as string).slice(0, 10), won: w, scored: s, rate: w / s });
  }

  return {
    runs: rows.length,
    open: count("open"),
    scored,
    won,
    lost,
    unscored: count("unscored"),
    hitRate: scored > 0 ? won / scored : null,
    byGrade,
    series,
    rows,
  };
}

/** "3 of 5 picks you ran won." Null until a run is scored. */
export function hitRateLine(record: TrackRecord): string | null {
  if (record.scored === 0) return null;
  return `${record.won} of ${record.scored} ${record.scored === 1 ? "test" : "tests"} you ran did better than its reference.`;
}

/**
 * What this grade has actually done for this brand, for the grade card.
 * Honest at every count: no finished runs says so, one says one.
 */
export function calibrationLine(record: TrackRecord, letter: GradeLetter | null): string | null {
  if (!letter || letter === "Hold") return null;
  const g = record.byGrade.find((x) => x.letter === letter);
  if (!g || g.runs === 0) return `No ${letter} picks have finished running for you yet.`;
  if (g.scored === 0) return `${g.runs} ${letter} ${g.runs === 1 ? "pick is" : "picks are"} running or unscored; none finished with a result yet.`;
  return `${letter} picks have won ${g.won} of ${g.scored} for you so far.`;
}

/** Percent for display: "60%". */
export function ratePct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
