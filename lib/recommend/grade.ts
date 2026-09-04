/**
 * Letter grades over the 0–10 opportunity score. The number still exists —
 * the breakdown meters show it — but the headline verdict reads like a
 * verdict, not a decimal. Bands are fixed so a B+ means the same thing
 * every week.
 */

export type GradeTone = "strong" | "solid" | "watch";

export interface Grade {
  letter: string;
  /** One-line verdict. */
  label: string;
  /** What to do about it. */
  sub: string;
  /** 0–1 fill for the ring. */
  pct: number;
  /** Color semantics: strong = go (mint), solid = worth it (amber),
   * watch = hold (neutral). The verdict reads at a glance. */
  tone: GradeTone;
}

export function gradeFor(score: number): Grade {
  const pct = Math.max(0, Math.min(1, score / 10));
  if (score >= 8) return { letter: "A", label: "Standout opportunity", sub: "Clear the week for it", pct, tone: "strong" };
  if (score >= 7) return { letter: "A-", label: "Strong opportunity", sub: "Worth acting on this week", pct, tone: "strong" };
  if (score >= 6.3) return { letter: "B+", label: "Solid opportunity", sub: "Act on it if the creative is easy", pct, tone: "solid" };
  if (score >= 5.6) return { letter: "B", label: "Decent opportunity", sub: "Good bet when it fits your week", pct, tone: "solid" };
  if (score >= 5) return { letter: "B-", label: "Fair opportunity", sub: "Run it small before you commit", pct, tone: "solid" };
  if (score >= 4.3) return { letter: "C+", label: "Borderline call", sub: "Only with creative you already have", pct, tone: "watch" };
  return { letter: "C", label: "Sit this one out", sub: "Watch it — don't spend yet", pct, tone: "watch" };
}