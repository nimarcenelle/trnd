import type { BrandPick, PickRun } from "@/lib/db/types";
import type { GradeLetter } from "@/lib/scoring/model";

import { fidelityLabel } from "@/lib/picks/fidelity";

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
  /** How closely the ad followed the brief, 0-1; null when unchecked. */
  fidelity: number | null;
}

/** The record split by whether the ad followed the brief, so a wrong
 * concept and a wrong shoot are counted apart. */
export interface FidelityRecord {
  followed: { runs: number; scored: number; won: number };
  strayed: { runs: number; scored: number; won: number };
  unchecked: number;
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
  byFidelity: FidelityRecord;
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
        fidelity: num(run.fidelity_score),
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

  const tally = (label: "followed" | "strayed") => {
    const mine = rows.filter((r) => fidelityLabel(r.fidelity) === label);
    const w = mine.filter((r) => r.outcome === "won").length;
    const l = mine.filter((r) => r.outcome === "lost").length;
    return { runs: mine.length, scored: w + l, won: w };
  };
  const byFidelity: FidelityRecord = {
    followed: tally("followed"),
    strayed: tally("strayed"),
    unchecked: rows.filter((r) => fidelityLabel(r.fidelity) === null).length,
  };

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
    byFidelity,
  };
}

/**
 * What the split says, in one line. Null until both sides have a scored
 * run: one side alone cannot separate the concept from the shoot.
 */
export function fidelityLine(record: TrackRecord): string | null {
  const { followed, strayed } = record.byFidelity;
  if (followed.scored === 0 && strayed.scored === 0) return null;
  const rate = (t: { scored: number; won: number }) => (t.scored > 0 ? `${t.won} of ${t.scored}` : "none scored");
  if (followed.scored > 0 && strayed.scored > 0) {
    const f = followed.won / followed.scored;
    const s = strayed.won / strayed.scored;
    const verdict =
      f > s
        ? "The briefs hold up where they were followed; the losses sit with the shoots that strayed."
        : f < s
          ? "Tests that strayed did better than tests that followed the brief: the briefs are the problem, not the shoots."
          : "Following the brief has not separated the winners from the losers yet.";
    return `Tests that followed the brief won ${rate(followed)}; tests that strayed won ${rate(strayed)}. ${verdict}`;
  }
  return followed.scored > 0
    ? `Tests that followed the brief won ${rate(followed)}. No scored test has strayed from its brief yet.`
    : `Tests that strayed from the brief won ${rate(strayed)}. No scored test has followed its brief yet.`;
}

/** "3 of 5 picks you ran won." Null until a run is scored. */
export function hitRateLine(record: TrackRecord): string | null {
  if (record.scored === 0) return null;
  return `${record.won} of ${record.scored} ${record.scored === 1 ? "test" : "tests"} you ran did better than its reference.`;
}

/**
 * What this grade has actually done for this brand, for the grade card.
 * Honest at every count: no finished runs says so, one says one. When the
 * runs logged a lift over the account, the median rides along: won or lost
 * is the verdict, the lift is by how much.
 */
export function calibrationLine(record: TrackRecord, letter: GradeLetter | null, lifts: number[] = []): string | null {
  if (!letter || letter === "Hold") return null;
  const g = record.byGrade.find((x) => x.letter === letter);
  if (!g || g.runs === 0) return `No ${letter} picks have finished running for you yet.`;
  if (g.scored === 0) return `${g.runs} ${letter} ${g.runs === 1 ? "pick is" : "picks are"} running or unscored; none finished with a result yet.`;
  const base = `${letter} picks have won ${g.won} of ${g.scored} for you so far.`;
  const valid = lifts.filter((l) => Number.isFinite(l) && l > 0).sort((a, b) => a - b);
  if (valid.length === 0) return base;
  const m = valid.length % 2 ? valid[(valid.length - 1) / 2] : (valid[valid.length / 2 - 1] + valid[valid.length / 2]) / 2;
  return `${base} Their click-through ran ${(Math.round(m * 100) / 100).toString()}x your account average (median of ${valid.length}).`;
}

/** The lifts the runs of one grade logged, for calibrationLine. */
export function liftsForGrade(runs: { run: Pick<PickRun, "lift">; pick: Pick<BrandPick, "grade"> }[], letter: GradeLetter | null): number[] {
  if (!letter) return [];
  return runs
    .filter(({ pick }) => gradeLetterOf(pick) === letter)
    .map(({ run }) => num(run.lift))
    .filter((n): n is number => n !== null && n > 0);
}

/** Percent for display: "60%". */
export function ratePct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
