/**
 * Where a school sits on a student's list, from their odds there. The usual counseling bands: likely at 60% and up,
 * target from 25%, reach below that. Shown to Pro.
 */
export type Tier = "Likely" | "Target" | "Reach";
export const tierFor = (odds: number): Tier => (odds >= 60 ? "Likely" : odds >= 25 ? "Target" : "Reach");
export const TIER_STYLE: Record<Tier, string> = { Likely: "badge badge-pos", Target: "badge badge-info", Reach: "badge badge-outline" };
