/**
 * One opportunity, graded: gather the four signals' inputs, score each, and
 * combine them into the Opportunity Grade (lib/scoring/model.ts).
 *
 * The catalog fit gate stays in front of the model. A term judged outside
 * what the business sells is not an opportunity at any grade, however loud
 * the week is on it: the product has always refused to build an ad for the
 * espresso-martini trend at a BBQ smokehouse, and four good signals on the
 * wrong thing do not change that.
 */

import type { Repo } from "@/lib/db/repo";
import type { Business, NewSignalReading, Signal } from "@/lib/db/types";

import { gatherSignalInputs, type GatherOptions, type GradeContext } from "./gather";
import { scoreBrand, scoreCompetitive, scoreCulture, scoreCustomer } from "./index";
import {
  combineSignals,
  gradeForScore,
  type GradeLetter,
  type OpportunityGrade,
  type SignalName,
  type SignalScore,
} from "./model";

/** Below this judged fit the term is outside the business. */
export const FIT_GATE = 0.4;
export const DOESNT_FIT_NOTE = "Doesn't fit what you sell";
/** A gated term sorts under every graded one. */
const HOLD_CEILING = 49.9;

export async function gradeOpportunity(
  repo: Repo,
  business: Business,
  signal: Signal,
  ctx: GradeContext,
  opts: GatherOptions = {},
): Promise<{ grade: OpportunityGrade; readings: NewSignalReading[] }> {
  const inputs = await gatherSignalInputs(repo, business, signal, ctx, opts);
  const grade = combineSignals({
    customer: scoreCustomer(inputs.customer),
    culture: scoreCulture(inputs.culture),
    competitive: scoreCompetitive(inputs.competitive),
    brand: scoreBrand(inputs.brand),
  });
  const fit = inputs.brand.economics.fit;
  return { grade: fit !== null && fit < FIT_GATE ? holdForFit(grade) : grade, readings: inputs.readings };
}

/** The fit gate: Hold, with the reason first so it is the note an owner reads. */
export function holdForFit(grade: OpportunityGrade): OpportunityGrade {
  return holdForReason(grade, DOESNT_FIT_NOTE);
}

/** Hold a graded term for a stated reason: the reason leads the notes, the
 * score is capped under every graded row, the signals stay readable. */
export function holdForReason(grade: OpportunityGrade, reason: string): OpportunityGrade {
  const hold = gradeForScore(0);
  return {
    ...grade,
    score: Math.min(grade.score, HOLD_CEILING),
    grade: hold.letter,
    meaning: hold.meaning,
    hold: true,
    notes: [reason, ...grade.notes.filter((n) => n !== reason)],
  };
}

/* ------------------------------ stored shape ------------------------------ */
// What goes in opportunities.signal_scores and picks.signal_scores.

export type StoredSignalScores = Record<SignalName, SignalScore> & {
  weightsUsed: Record<SignalName, number>;
  excluded: SignalName[];
  notes: string[];
};

export function storedSignalScores(grade: OpportunityGrade): StoredSignalScores {
  return {
    ...grade.signals,
    weightsUsed: grade.weightsUsed,
    excluded: grade.excluded,
    notes: grade.notes,
  };
}

export interface StoredGrade {
  letter: GradeLetter;
  /** 0-100. */
  score: number;
  meaning: string;
  hold: boolean;
  signals: StoredSignalScores | null;
}

const LETTERS = new Set<string>(["A+", "A", "B+", "B", "C", "Hold"]);

/** The grade a row was stored with; null on rows ranked before the model or
 * before migration 0024 (the columns come back missing or empty). */
export function storedGrade(row: {
  grade?: string | null;
  grade_score?: number | string | null;
  signal_scores?: Record<string, unknown> | null;
}): StoredGrade | null {
  if (!row.grade || !LETTERS.has(row.grade) || row.grade_score === null || row.grade_score === undefined) return null;
  const score = Number(row.grade_score);
  if (!Number.isFinite(score)) return null;
  const s = row.signal_scores;
  const signals = s && typeof s === "object" && "customer" in s ? (s as unknown as StoredSignalScores) : null;
  const letter = row.grade as GradeLetter;
  return {
    letter,
    score,
    meaning: letter === "Hold" ? gradeForScore(0).meaning : gradeForScore(score).meaning,
    hold: letter === "Hold",
    signals,
  };
}

/** Rank order for rows that may or may not carry a grade: the grade score
 * when there is one, the legacy 0-10 score on the same 0-100 scale otherwise. */
export function rankScoreOf(row: { score: number | string; grade_score?: number | string | null }): number {
  const g = row.grade_score === null || row.grade_score === undefined ? NaN : Number(row.grade_score);
  return Number.isFinite(g) ? g : Number(row.score) * 10;
}
