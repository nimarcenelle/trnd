import type { Repo } from "@/lib/db/repo";
import type { Business, PickDismissReason } from "@/lib/db/types";
import { normalizeTerm } from "@/lib/signals/normalize";

import { runOutcome, type OutcomeContext, type RunOutcome } from "./outcome";

/**
 * The brand's memory of its own picks: what it ran and how that went, and
 * what it passed on and why. The ranking reads it so a term the brand
 * killed three weeks ago is never handed back as this week's #1, and the
 * writer reads it so a repeat of a winner is framed as a repeat.
 */

/** A lost run keeps its term out of the ranking this long. */
export const LOST_COOLOFF_DAYS = 56;
/** A pass ("Not for us") keeps its term out this long. */
export const DISMISSED_COOLOFF_DAYS = 28;

export interface MemoryRun {
  status: "running" | "completed" | "killed";
  outcome: RunOutcome;
  reason: string;
  startedAt: string;
  endedAt: string | null;
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
    runs: { run: Parameters<typeof runOutcome>[0] & { started_at: string; ended_at: string | null }; pick: { term: string } }[];
    feedback: { feedback: { action: "running" | "dismissed"; reason: PickDismissReason | null; created_at: string }; pick: { term: string } }[];
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
  if (live) return { kind: "memory", reason: `You're running this now (since ${day(live.startedAt)})` };
  const lost = mem.runs.find(
    (r) => r.outcome === "lost" && r.endedAt && now.getTime() - new Date(r.endedAt).getTime() < LOST_COOLOFF_DAYS * DAY_MS,
  );
  if (lost) {
    const when = day(lost.endedAt as string);
    return {
      kind: "memory",
      reason: lost.status === "killed" ? `You ran this and killed it on ${when}` : `You ran this and it lost (${lost.reason.toLowerCase()}, ended ${when})`,
    };
  }
  const passed = mem.dismissals.find((d) => now.getTime() - new Date(d.at).getTime() < DISMISSED_COOLOFF_DAYS * DAY_MS);
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
    out.push(`The brand ran an ad on "${mem.term}" ${span}: ${how}.`);
  }
  for (const d of mem.dismissals.slice(0, 2)) out.push(`${DISMISS_LINE[d.reason ?? "none"](day(d.at))}.`);
  return out;
}

/** The last win on a term, for evidence and the finding. */
export function lastWin(mem: TermMemory | undefined): MemoryRun | null {
  return mem?.runs.find((r) => r.outcome === "won") ?? null;
}
