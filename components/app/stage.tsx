import type { Stage } from "@/lib/creators/stats";

export const STAGE_LABEL: Record<Stage, string> = { early: "Early", rising: "Rising", peaking: "Peaking", fading: "Fading" };
const STEP: Record<Stage, number> = { early: 1, rising: 2, peaking: 3, fading: 4 };

/** Early → fading as four segments: cyan while it is worth joining, amber at the peak, gray once it fades. */
export function StageBar({ stage }: { stage: Stage }) {
  return (
    <span className={`stage ${stage}`} aria-label={STAGE_LABEL[stage]}>
      {[1, 2, 3, 4].map((k) => (
        <i key={k} className={k <= STEP[stage] ? "on" : ""} />
      ))}
    </span>
  );
}
