import { readAdHistory } from "@/lib/ads/history-read";
import type { AdHistory, BrandPick, PickRun } from "@/lib/db/types";
import type { GradeLetter } from "@/lib/scoring/model";

import { runOutcome, type OutcomeContext } from "./outcome";
import { GRADE_ORDER, gradeLetterOf } from "./track";

/**
 * Predicted against actual, per run.
 *
 * The stamp on a pick (the grade and its 0-100 score) is the prediction.
 * The run is the actual: its click-through over the account's own, frozen
 * on the run the day it ended so the comparison never drifts as the history
 * grows. Logged per run, the two answer the only question a stamp has to
 * answer to earn its confidence: do the picks it graded higher actually do
 * better here? Nothing here is a probability; it is a count and a ratio the
 * owner can check against Ads Manager.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface LiftRead {
  /** The account's click-through the run is judged against. */
  baselineCtr: number | null;
  /** The run's click-through over the baseline; null without both. */
  lift: number | null;
}

/**
 * The run's lift over the brand's own account. The run's own ad-history row
 * (by campaign name) is left out of the baseline, so a brand whose only
 * history is this one run does not read as exactly its usual.
 */
export function runLift(
  results: { impressions: number | null; clicks: number | null },
  history: AdHistory[],
  ownCampaignName?: string,
): LiftRead {
  const rest = ownCampaignName ? history.filter((r) => r.campaign_name !== ownCampaignName) : history;
  const baselineCtr = readAdHistory(rest).accountCtr;
  const ctr = results.impressions && results.clicks !== null && results.impressions > 0 ? results.clicks / results.impressions : null;
  if (!baselineCtr || ctr === null) return { baselineCtr: baselineCtr ?? null, lift: null };
  return { baselineCtr: round3(baselineCtr), lift: round3(ctr / baselineCtr) };
}

export interface GradeCalibration {
  letter: GradeLetter;
  runs: number;
  scored: number;
  won: number;
  /** Mean stored grade score of the scored runs' picks; null when none carried one. */
  predicted: number | null;
  /** Won over scored, 0-1; null until one is scored. */
  hitRate: number | null;
  /** Median lift over the account across the runs that logged one. */
  medianLift: number | null;
  lifts: number;
}

export interface CalibrationReport {
  scored: number;
  grades: GradeCalibration[];
  /** True when every higher grade with two or more scored runs beats the
   * grades below it on hit rate; false when a lower grade beats a higher
   * one; null until two grades have two scored runs each. */
  ordered: boolean | null;
  /** One sentence on what the log says so far. Null with nothing scored. */
  line: string | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Two scored runs is the least a rate can rest on and still be a rate. */
export const MIN_SCORED_FOR_ORDER = 2;

export function calibrationReport(runs: { run: PickRun; pick: BrandPick }[], ctx: OutcomeContext = {}): CalibrationReport {
  const grades: GradeCalibration[] = [];
  for (const letter of GRADE_ORDER) {
    const mine = runs.filter(({ pick }) => gradeLetterOf(pick) === letter);
    if (mine.length === 0) continue;
    const scoredRuns = mine.filter(({ run }) => {
      const o = runOutcome(run, ctx).outcome;
      return o === "won" || o === "lost";
    });
    const won = scoredRuns.filter(({ run }) => runOutcome(run, ctx).outcome === "won").length;
    const predictedScores = scoredRuns.map(({ pick }) => num(pick.grade_score)).filter((n): n is number => n !== null);
    const lifts = mine.map(({ run }) => num(run.lift)).filter((n): n is number => n !== null && n > 0);
    grades.push({
      letter,
      runs: mine.length,
      scored: scoredRuns.length,
      won,
      predicted: predictedScores.length ? Math.round(predictedScores.reduce((a, b) => a + b, 0) / predictedScores.length) : null,
      hitRate: scoredRuns.length ? won / scoredRuns.length : null,
      medianLift: median(lifts) === null ? null : round3(median(lifts) as number),
      lifts: lifts.length,
    });
  }
  const scored = grades.reduce((n, g) => n + g.scored, 0);

  // Ordered: read down the grade order, every grade with enough scored runs
  // must not beat the one above it.
  const rated = grades.filter((g) => g.scored >= MIN_SCORED_FOR_ORDER);
  let ordered: boolean | null = null;
  if (rated.length >= 2) {
    ordered = true;
    for (let i = 1; i < rated.length; i++) {
      if ((rated[i].hitRate as number) > (rated[i - 1].hitRate as number)) ordered = false;
    }
  }

  let line: string | null = null;
  if (scored > 0) {
    const parts = grades.filter((g) => g.scored > 0).map((g) => `${g.letter} picks won ${g.won} of ${g.scored}`);
    const head = `Across ${scored} scored ${scored === 1 ? "test" : "tests"}, ${parts.join(", ")}.`;
    line =
      ordered === null
        ? `${head} The stamp can be checked against results once two grades have two finished tests each.`
        : ordered
          ? `${head} So far the higher grade has won more often, which is what the stamp claims.`
          : `${head} So far a lower grade has beaten a higher one; read the stamp as an order of research, not a prediction.`;
  }
  return { scored, grades, ordered, line };
}
