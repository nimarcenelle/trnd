import type { CampaignStatus } from "@/lib/db/types";

const STEPS: { key: CampaignStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "exported", label: "Exported" },
  { key: "live", label: "Live" },
  { key: "complete", label: "Complete" },
];

/** The campaign lifecycle: every step labelled, the current one in amber. */
export default function StatusTimeline({ status }: { status: CampaignStatus }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="timeline" role="img" aria-label={`Campaign status: ${status}, step ${idx + 1} of ${STEPS.length}`}>
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
