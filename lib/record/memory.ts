import type { Repo } from "@/lib/db/repo";
import type { Business, PickDismissReason, PickFeedbackAction } from "@/lib/db/types";
import { normalizeTerm } from "@/lib/signals/normalize";

import { runOutcome, type OutcomeContext, type RunOutcome } from "./outcome";

/**
 * The brand's memory of its own picks: what it ran and how that went, and
 * what it passed on and why. The ranking reads it so a term the brand
 * killed three weeks ago is never handed back as this week's #1, and the
 * writer reads it so a repeat of a winner is framed as a repeat.
 */

/**
 * How long a past decision holds a term out of the ranking. Short on
 * purpose: a test that did not win says the execution did not work, not
 * that the topic is dead, and a pass is a decision, not a result. The
 * writer is told what happened either way, so a term that comes back
 * comes back as a different concept.
 */
export const LOST_COOLOFF_DAYS = 21;
export const KILLED_COOLOFF_DAYS = 14;
export const DISMISSED_COOLOFF_DAYS = 28;
export const NOT_NOW_COOLOFF_DAYS = 14;

export interface MemoryRun {
  status: "planned" | "running" | "completed" | "killed";
  outcome: RunOutcome;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  /** The concept's title when the run was a creative test. */
  title: string | null;
  /** What the owner said the test taught. */
  learned: string | null;
}

export interface MemoryDismissal {
  reason: PickDismissReason | null;
  at: string;
}

export interface TermMemory {
  term: string;
  normalized: string;
  /** Newest first. */
  runs: MemoryRun[];
  /** Newest first. */
  dismissals: MemoryDismissal[];
}

export type BrandMemory = Map<string, TermMemory>;

const DAY_MS = 86_400_000;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function loadBrandMemory(repo: Repo, business: Business, ctx: OutcomeContext = {}): Promise<BrandMemory> {
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.warn("[memory] read failed (non-fatal):", (err as Error).message);
      return fallback;
    }
  };
  const [runs, feedback] = await Promise.all([
    safe(repo.listPickRuns(business.id), []),
    safe(repo.listPickFeedback(business.id), []),
  ]);
  return buildBrandMemory({ runs, feedback }, ctx);
}

export function buildBrandMemory(
  input: {
    runs: {
      run: Parameters<typeof runOutcome>[0] & { started_at: string; ended_at: string | null; learned?: string | null };
      pick: { term: string; concept_title?: string | null };
    }[];
    feedback: { feedback: { action: PickFeedbackAction; reason: PickDismissReason | null; created_at: string }; pick: { term: string } }[];
  },
  ctx: OutcomeContext = {},
): BrandMemory {
  const memory: BrandMemory = new Map();
  const entry = (term: string): TermMemory => {
    const normalized = normalizeTerm(term);
    const e = memory.get(normalized) ?? { term, normalized, runs: [], dismissals: [] };
    memory.set(normalized, e);
    return e;
  };
  for (const { run, pick } of input.runs) {
    const read = runOutcome(run, ctx);
    entry(pick.term).runs.push({
      status: run.status,
      outcome: read.outcome,
      reason: read.reason,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      title: pick.concept_title ?? null,
      learned: run.learned ?? null,
    });
  }
  for (const { feedback, pick } of input.feedback) {
    if (feedback.action !== "dismissed") continue;
    entry(pick.term).dismissals.push({ reason: feedback.reason, at: feedback.created_at });
  }
  for (const e of memory.values()) {
    e.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    e.dismissals.sort((a, b) => b.at.localeCompare(a.at));
  }
  return memory;
}

const DISMISS_LINE: Record<PickDismissReason | "none", (when: string) => string> = {
  already_tried: (when) => `You said you already tried this (${when})`,
  off_brand: (when) => `You said this is off-brand (${when})`,
  wrong_customer: (when) => `You said this is the wrong customer (${when})`,
  cant_shoot: (when) => `You said you can't shoot this (${when})`,
  not_now: (when) => `You said not now (${when})`,
  other: (when) => `You passed on this (${when})`,
  none: (when) => `You passed on this (${when})`,
};

export interface MemoryHold {
  kind: "memory";
  reason: string;
}

/**
 * Should the ranking hold this term because of what the brand already did
 * with it. A live run holds it (one ad on a term at a time); a lost run
 * holds it for the cool-off; a pass holds it for a shorter one. A win never
 * holds: a winner is exactly what a strategist asks to run again.
 */
export function memoryHold(mem: TermMemory | undefined, now = new Date()): MemoryHold | null {
  if (!mem) return null;
  const live = mem.runs.find((r) => r.outcome === "open");
  if (live) {
    return {
      kind: "memory",
      reason: live.status === "planned" ? `You chose this for production (${day(live.startedAt)})` : `You're running this now (since ${day(live.startedAt)})`,
    };
  }
  const lost = mem.runs.find((r) => {
    if (r.outcome !== "lost" || !r.endedAt) return false;
    const days = r.status === "killed" ? KILLED_COOLOFF_DAYS : LOST_COOLOFF_DAYS;
    return now.getTime() - new Date(r.endedAt).getTime() < days * DAY_MS;
  });
  if (lost) {
    const when = day(lost.endedAt as string);
    const what = lost.title ? `"${lost.title}"` : "this";
    return {
      kind: "memory",
      reason:
        lost.status === "killed"
          ? `You stopped ${what} on ${when}; the topic comes back with a different concept`
          : `You ran ${what} and it did not win (${lost.reason.toLowerCase()}, ended ${when}); the topic comes back with a different concept`,
    };
  }
  const passed = mem.dismissals.find((d) => {
    const days = d.reason === "not_now" ? NOT_NOW_COOLOFF_DAYS : DISMISSED_COOLOFF_DAYS;
    return now.getTime() - new Date(d.at).getTime() < days * DAY_MS;
  });
  if (passed) return { kind: "memory", reason: DISMISS_LINE[passed.reason ?? "none"](day(passed.at)) };
  return null;
}

/**
 * What the writer should know about this term before it writes: every run
 * and pass on it, newest first, as plain lines.
 */
export function memoryLines(mem: TermMemory | undefined): string[] {
  if (!mem) return [];
  const out: string[] = [];
  for (const r of mem.runs.slice(0, 3)) {
    const span = r.endedAt ? `${day(r.startedAt)} to ${day(r.endedAt)}` : `since ${day(r.startedAt)}`;
    const how =
      r.outcome === "won"
        ? `it won (${r.reason})`
        : r.outcome === "lost"
          ? `it lost (${r.reason.toLowerCase()})`
          : r.outcome === "open"
            ? "still running"
            : "no result recorded";
    const what = r.title ? `the concept "${r.title}" (from "${mem.term}")` : `an ad on "${mem.term}"`;
    out.push(`The brand ran ${what} ${span}: ${how}.${r.learned ? ` What they learned: ${r.learned}` : ""}`);
  }
  for (const d of mem.dismissals.slice(0, 2)) out.push(`${DISMISS_LINE[d.reason ?? "none"](day(d.at))}.`);
  return out;
}

/** The last win on a term, for evidence and the finding. */
export function lastWin(mem: TermMemory | undefined): MemoryRun | null {
  return mem?.runs.find((r) => r.outcome === "won") ?? null;
}
