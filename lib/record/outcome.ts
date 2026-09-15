import type { PickRun, RunVerdict } from "@/lib/db/types";

/**
 * What a run did, in one word the track record can count. The owner's own
 * verdict wins when they gave one; a killed run lost by definition; a
 * completed run is judged by its numbers against the brand's own account
 * first and a category benchmark second. A run with neither numbers nor a
 * verdict is counted as run, never as won or lost.
 */

export type RunOutcome = "won" | "lost" | "open" | "unscored";

export interface OutcomeRead {
  outcome: RunOutcome;
  /** One line the owner can check: "ROAS 2.4x", "You killed it". */
  reason: string;
  /** Where the call came from. */
  basis: "verdict" | "killed" | "roas" | "ctr" | "none";
}

/** Return on spend that makes a run a win on its own, and the line under
 * which it lost. Between them the click-through decides. */
export const WIN_ROAS = 1.5;
export const LOSE_ROAS = 1;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const pct = (r: number) => `${(r * 100).toFixed(r * 100 >= 10 ? 0 : 1)}%`;
const x = (r: number) => `${(Math.round(r * 10) / 10).toString()}x`;

export interface OutcomeContext {
  /** The brand's own click-through average across its ad history. */
  accountCtr?: number | null;
  /** The category's typical click-through, when no account average exists. */
  benchmarkCtr?: number | null;
}

export function runOutcome(
  run: Pick<PickRun, "status" | "spend_usd" | "impressions" | "clicks" | "conversions" | "revenue_usd"> & { verdict?: RunVerdict | null },
  ctx: OutcomeContext = {},
): OutcomeRead {
  if (run.status === "planned") return { outcome: "open", reason: "Chosen, not launched yet", basis: "none" };
  if (run.status === "running") return { outcome: "open", reason: "Still running", basis: "none" };
  if (run.verdict === "won") return { outcome: "won", reason: "You called it a win", basis: "verdict" };
  if (run.verdict === "lost") return { outcome: "lost", reason: "You called it a loss", basis: "verdict" };
  if (run.status === "killed") return { outcome: "lost", reason: "You killed it", basis: "killed" };

  const spend = num(run.spend_usd);
  const revenue = num(run.revenue_usd);
  const impressions = num(run.impressions);
  const clicks = num(run.clicks);
  const roas = spend !== null && spend > 0 && revenue !== null ? revenue / spend : null;
  if (roas !== null && roas >= WIN_ROAS) return { outcome: "won", reason: `ROAS ${x(roas)}`, basis: "roas" };
  if (roas !== null && roas < LOSE_ROAS) return { outcome: "lost", reason: `ROAS ${x(roas)}, under break-even`, basis: "roas" };

  const ctr = impressions !== null && impressions > 0 && clicks !== null ? clicks / impressions : null;
  const against =
    num(ctx.accountCtr) !== null && (ctx.accountCtr as number) > 0
      ? { value: ctx.accountCtr as number, label: "your average" }
      : num(ctx.benchmarkCtr) !== null && (ctx.benchmarkCtr as number) > 0
        ? { value: ctx.benchmarkCtr as number, label: "the category average" }
        : null;
  if (ctr !== null && against) {
    const roasNote = roas !== null ? `ROAS ${x(roas)}, ` : "";
    return ctr >= against.value
      ? { outcome: "won", reason: `${roasNote}CTR ${pct(ctr)} vs ${pct(against.value)} ${against.label}`, basis: "ctr" }
      : { outcome: "lost", reason: `${roasNote}CTR ${pct(ctr)} vs ${pct(against.value)} ${against.label}`, basis: "ctr" };
  }
  if (roas !== null) return { outcome: "unscored", reason: `ROAS ${x(roas)}, about break-even`, basis: "roas" };
  return { outcome: "unscored", reason: "Completed without numbers or a verdict", basis: "none" };
}

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  won: "Won",
  lost: "Lost",
  open: "Running",
  unscored: "Completed",
};

/**
 * What a status means, said once. The brief's rule: passed on is not a
 * performance failure, chosen is not launched, launched is not successful,
 * and no results is not a loss.
 */
export const STATUS_MEANING: Record<PickRun["status"], string> = {
  planned: "Chosen for production. Nothing is live yet.",
  running: "Launched. No result has been recorded.",
  completed: "Ended. Judged only by what was recorded.",
  killed: "Stopped early by you. That is a decision, not a measured loss of the whole angle.",
};

export type OutcomeTone = "mint" | "red" | "amber" | "faint";
export const OUTCOME_TONE: Record<RunOutcome, OutcomeTone> = {
  won: "mint",
  lost: "red",
  open: "amber",
  unscored: "faint",
};
