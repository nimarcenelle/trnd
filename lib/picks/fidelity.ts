import type { CreativeBrief, FidelityRead } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";

import { contentWords, wordOverlap } from "./concept";

/**
 * The finished ad checked against its brief.
 *
 * A test that loses can be a wrong concept or a wrong shoot, and a record
 * that lumps the two cannot learn from either. So before (or after) an ad
 * runs, its words are checked against the brief on the four things the
 * brief actually dictates: the hook, the opening beats, the approved facts
 * and the format. Each check is yes, no, or could not tell; the score is
 * the share of the checks that could be made that came back yes. The rules
 * below always run; the model refines them when it is configured.
 */

export const FIDELITY_VERSION = "fidelity-1";
/** At or above this a test counts as having followed the brief. */
export const FIDELITY_FOLLOWED = 0.67;
export const RULES_MODEL = "trnd-rules/fidelity-1";
export const MAX_AD_TEXT = 6000;

export type FidelityChecks = Pick<FidelityRead, "hook_present" | "opening_followed" | "facts_only" | "format_matches" | "notes">;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function contains(text: string, line: string): boolean {
  const t = norm(text);
  const l = norm(line);
  if (!l) return false;
  return t.includes(l) || wordOverlap(text, line) >= 0.75;
}

/** Numbers in the ad that no approved fact or the catalog carries. */
function foreignFigures(text: string, brief: CreativeBrief): string[] {
  const known = new Set(
    [...brief.approved_facts, brief.script.cta, ...(brief.opening?.beats ?? []).flatMap((b) => [b.on_screen_text, b.vo])]
      .join(" ")
      .match(/\$?\d+(?:[.,]\d+)?%?/g) ?? [],
  );
  return [...new Set(text.match(/\$\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?%|\b\d{2,}\b/g) ?? [])].filter((n) => !known.has(n));
}

export function fidelityScore(c: Pick<FidelityChecks, "hook_present" | "opening_followed" | "facts_only" | "format_matches">): number | null {
  const checks = [c.hook_present, c.opening_followed, c.facts_only, c.format_matches].filter((v): v is boolean => v !== null);
  if (checks.length === 0) return null;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
}

/** The deterministic read: word overlap with the brief's dictated lines. */
export function checkFidelityRules(brief: CreativeBrief, adText: string): FidelityChecks {
  const text = adText.slice(0, MAX_AD_TEXT);
  const notes: string[] = [];
  const hooks = [brief.hooks.primary, ...brief.hooks.alternatives];
  const hookHit = hooks.find((h) => contains(text, h));
  const hook_present = Boolean(hookHit);
  if (hookHit && hookHit !== brief.hooks.primary) notes.push("Opens on one of the alternative hooks, not the primary.");
  if (!hook_present) notes.push("None of the brief's hooks appears in the ad's words.");

  let opening_followed: boolean | null = null;
  const beats = brief.opening?.beats ?? [];
  if (beats.length > 0) {
    const lines = beats.flatMap((b) => [b.vo, b.on_screen_text]).filter((s) => contentWords(s).length >= 2);
    if (lines.length > 0) {
      const hits = lines.filter((l) => contains(text, l)).length;
      opening_followed = hits >= Math.ceil(lines.length / 2);
      if (!opening_followed) notes.push(`${hits} of the ${lines.length} opening lines appear in the ad.`);
    }
  }

  const foreign = foreignFigures(text, brief);
  const facts_only = foreign.length === 0;
  if (!facts_only) notes.push(`The ad carries figures the brief did not approve: ${foreign.slice(0, 4).join(", ")}.`);

  // Format cannot be read from words alone; the model may know more.
  const format_matches: boolean | null = null;
  return { hook_present, opening_followed, facts_only, format_matches, notes };
}

export type FidelityChecker = (brief: CreativeBrief, adText: string) => Promise<{ value: FidelityChecks; model: string }>;

export function defaultFidelityChecker(): FidelityChecker | null {
  if (!isModelConfigured) return null;
  return async (brief, adText) => {
    const { checkAdFidelityWithModel } = await import("@/lib/ai/openai");
    return checkAdFidelityWithModel(brief, adText.slice(0, MAX_AD_TEXT));
  };
}

/**
 * The read to store on the run: the model's when it answers, the rules'
 * otherwise, with the rules' hook and figures checks overriding a model
 * that said yes where the words plainly say no.
 */
export async function checkFidelity(
  brief: CreativeBrief,
  adText: string,
  source: FidelityRead["source"],
  opts: { checker?: FidelityChecker | null; now?: Date } = {},
): Promise<{ read: FidelityRead; score: number | null }> {
  const rules = checkFidelityRules(brief, adText);
  let checks = rules;
  let model = RULES_MODEL;
  const checker = opts.checker === undefined ? defaultFidelityChecker() : opts.checker;
  if (checker) {
    try {
      const out = await checker(brief, adText);
      checks = {
        ...out.value,
        hook_present: out.value.hook_present === true && !rules.hook_present ? rules.hook_present : out.value.hook_present,
        facts_only: out.value.facts_only === true && !rules.facts_only ? false : out.value.facts_only,
        notes: [...new Set([...out.value.notes, ...(rules.facts_only ? [] : rules.notes.filter((n) => n.startsWith("The ad carries")))])].slice(0, 5),
      };
      model = out.model;
    } catch (err) {
      console.warn("[fidelity] model check failed; the rules stand:", (err as Error).message);
    }
  }
  const read: FidelityRead = { version: FIDELITY_VERSION, ...checks, source, checked_at: (opts.now ?? new Date()).toISOString(), model };
  return { read, score: fidelityScore(checks) };
}

/** "Followed the brief", "Strayed from the brief", or null when unchecked. */
export function fidelityLabel(score: number | null | undefined): "followed" | "strayed" | null {
  const n = typeof score === "string" ? Number(score) : score;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n >= FIDELITY_FOLLOWED ? "followed" : "strayed";
}

/** One line for the run: "Followed the brief (3 of 4): hook yes, opening yes, facts yes, format not read". */
export function fidelityLine(read: FidelityRead, score: number | null): string {
  const word = (v: boolean | null) => (v === null ? "not read" : v ? "yes" : "no");
  const label = fidelityLabel(score);
  const head = label === "followed" ? "Followed the brief" : label === "strayed" ? "Strayed from the brief" : "Could not check";
  return `${head}${score === null ? "" : ` (${Math.round(score * 100)}%)`}: hook ${word(read.hook_present)}, opening ${word(read.opening_followed)}, facts ${word(read.facts_only)}, format ${word(read.format_matches)}.`;
}
