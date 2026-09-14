import type { BrandPick, PickRun, WeekSkip } from "@/lib/db/types";

/**
 * The "don't" half of the call. A strategist who only ever says "run this"
 * is half a strategist; this is the other half: the run that has outlived
 * its own duration and needs a result or a kill, and the terms the week
 * held with the reason it held them.
 */

export interface DontCall {
  key: string;
  kind: "run_due" | "skip";
  /** The term, sentence-cased by the page. */
  term: string;
  /** What to do, or why not to run it. */
  line: string;
  href: string | null;
  grade: string | null;
}

const DAY_MS = 86_400_000;

/** Running picks past the duration their bet set. */
export function overdueRuns(runs: { run: PickRun; pick: BrandPick }[], now = new Date()): DontCall[] {
  const out: DontCall[] = [];
  for (const { run, pick } of runs) {
    if (run.status !== "running") continue;
    const started = new Date(run.started_at).getTime();
    if (!Number.isFinite(started)) continue;
    const dayIn = Math.floor((now.getTime() - started) / DAY_MS) + 1;
    const planned = Number(pick.bet_duration_days) || 0;
    if (planned <= 0 || dayIn <= planned) continue;
    out.push({
      key: `run:${run.id}`,
      kind: "run_due",
      term: pick.term,
      line: `Day ${dayIn} of ${planned}. Enter its results or kill it; the bet was ${planned} days.`,
      href: "/app/campaigns",
      grade: pick.grade ?? null,
    });
  }
  return out;
}

/** The week's held terms as calls: memory and fit first, then holds. */
export function skipCalls(skips: WeekSkip[], limit = 4): DontCall[] {
  return skips.slice(0, limit).map((s) => ({
    key: `skip:${s.id}`,
    kind: "skip",
    term: s.term,
    line: s.reason.replace(/\.?$/, "."),
    href: null,
    grade: s.grade,
  }));
}

/** What not to run this week: overdue runs first, then the held terms. */
export function notThisWeek(input: { runs: { run: PickRun; pick: BrandPick }[]; skips: WeekSkip[]; now?: Date; limit?: number }): DontCall[] {
  const limit = input.limit ?? 4;
  const due = overdueRuns(input.runs, input.now);
  return [...due, ...skipCalls(input.skips, Math.max(0, limit - due.length))];
}
