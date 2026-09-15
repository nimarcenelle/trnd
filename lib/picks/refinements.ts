import type { CreativeBrief } from "@/lib/db/types";

/**
 * The five refinement asks, what each becomes as an instruction to the
 * writer, and the one that needs no writer. Plain module: the server
 * action in refine.ts may export only functions.
 */

export const REFINEMENTS = [
  { value: "footage", label: "Adapt to footage we already have", needsNote: true },
  { value: "hook", label: "Change the hook", needsNote: false },
  { value: "objection", label: "Address another objection", needsNote: true },
  { value: "priority", label: "Explain why this deserves priority", needsNote: false },
  { value: "simpler", label: "Make the production simpler", needsNote: false },
] as const;

export type RefinementKind = (typeof REFINEMENTS)[number]["value"];

export interface RefineState {
  error?: string;
  ok?: boolean;
}

export function askFor(kind: RefinementKind, note: string): string {
  switch (kind) {
    case "footage":
      return `Adapt the shot list and the direction to footage the brand already has, and change nothing else: ${note}`;
    case "hook":
      return "Change the primary hook to a different opening on the same concept. Keep the hypothesis, the facts, the shot list and the evaluation exactly as they are.";
    case "objection":
      return `Rewrite the situation, the hook and the direction to answer a different objection, and keep the concept, the facts and the evaluation: ${note}`;
    case "priority":
      return "Rewrite priority_reason in two or three sentences that argue from the evidence for why this deserves a test this week. Change nothing else.";
    case "simpler":
      return "Make the production simpler: one person, one phone, natural light, no editing. Shorten the shot list to what that person can do in an hour. Keep the concept, the hook and the facts.";
  }
}

/** The one refinement code can do alone: rotate the openings. */
export function rotateHook(brief: CreativeBrief): CreativeBrief | null {
  if (brief.hooks.alternatives.length === 0) return null;
  const [next, ...rest] = brief.hooks.alternatives;
  return { ...brief, hooks: { primary: next, alternatives: [...rest, brief.hooks.primary] } };
}
