import type { CampaignStatus } from "@/lib/db/types";

const STEPS: { key: CampaignStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "exported", label: "Exported" },
  { key: "live", label: "Live" },
  { key: "complete", label: "Complete" },
];

/**
 * Campaign lifecycle. Full variant labels every step; compact fits in cards —
 * dots plus one label for where the campaign is now.
 */
export default function StatusTimeline({
  status,
  compact = false,
}: {
  status: CampaignStatus;
  compact?: boolean;
}) {
  const idx = STEPS.findIndex((s) => s.key === status);
  if (compact) {
    return (
      <span
        className="timeline timeline--compact"
        role="img"
        aria-label={`Campaign status: ${status}, step ${idx + 1} of ${STEPS.length}`}
      >
        {STEPS.map((s, i) => (
          <i
            key={s.key}
            className={`tl-dot${i < idx ? " done" : i === idx ? " current" : ""}`}
          />
        ))}
        <span className="tl-label">{STEPS[idx].label}</span>
      </span>
    );
  }
  return (
    <div className="timeline" role="img" aria-label={`Campaign status: ${status}`}>
      {STEPS.map((s, i) => (
        <span key={s.key} style={{ display: "contents" }}>
          {i > 0 && <span className="timeline__bar" />}
          <span className={`timeline__step${i < idx ? " done" : i === idx ? " current" : ""}`}>
            <span className="timeline__dot">{i < idx ? "✓" : i + 1}</span>
            <span className="timeline__label">{s.label}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
