import { gradeForScore, type GradeLetter } from "@/lib/scoring/model";

/**
 * Letter grades over the 0-10 opportunity score, on the four-signal model's
 * bands (lib/scoring/model.ts). The ranking stores the Opportunity Grade as a
 * 0-100 score and keeps `score` as that divided by ten, so this is the same
 * grade read from the older column: a 5.4 is a C here exactly as its stored
 * grade is, never a B- on a second scale.
 */

export type GradeTone = "strong" | "solid" | "watch";

export interface Grade {
  letter: GradeLetter;
  /** One-line verdict. */
  label: string;
  /** What to do about it. */
  sub: string;
  /** 0-1 fill for the ring. */
  pct: number;
  /** strong = go (mint), solid = worth it (amber), watch = hold (neutral). */
  tone: GradeTone;
}

const COPY: Record<GradeLetter, { label: string; sub: string; tone: GradeTone }> = {
  "A+": { label: "Standout opportunity", sub: "Rare. Drop everything for it", tone: "strong" },
  A: { label: "Strong opportunity", sub: "A clear go", tone: "strong" },
  "B+": { label: "Good opportunity", sub: "Worth running", tone: "solid" },
  B: { label: "Reasonable opportunity", sub: "Worth running, not urgent", tone: "solid" },
  C: { label: "Marginal opportunity", sub: "Hold unless nothing better is available", tone: "watch" },
  Hold: { label: "Hold", sub: "Don't build a campaign yet", tone: "watch" },
};

export function gradeFor(score: number): Grade {
  const pct = Math.max(0, Math.min(1, score / 10));
  const { letter } = gradeForScore(score * 10);
  return { letter, pct, ...COPY[letter] };
}
