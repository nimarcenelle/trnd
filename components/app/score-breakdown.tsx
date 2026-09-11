import { WEIGHTS } from "@/lib/scoring";

export interface BreakdownData {
  normalizedDelta: number;
  serviceMatch: number;
  competitorGap: number;
  historicalLift: number;
}

const ROWS = [
  { key: "normalizedDelta", label: "Momentum", weight: WEIGHTS.normalizedDelta, hint: "This week vs last, plus the 30-day line" },
  { key: "serviceMatch", label: "Fit", weight: WEIGHTS.serviceMatch, hint: "Matches what you sell" },
  { key: "competitorGap", label: "Open door", weight: WEIGHTS.competitorGap, hint: "Who else is on it" },
  { key: "historicalLift", label: "Track record", weight: WEIGHTS.historicalLift, hint: "Similar campaigns" },
] as const;

const STAR_PATH =
  "M8 1.3l2.05 4.16 4.59.67-3.32 3.23.78 4.57L8 11.77l-4.1 2.16.78-4.57L1.36 6.13l4.59-.67z";

function Star({ fill }: { fill: number }) {
  return (
    <span className="stars__star">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={STAR_PATH} className="stars__base" />
      </svg>
      {fill > 0 && (
        <span className="stars__over" style={{ width: `${fill * 100}%` }}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={STAR_PATH} className="stars__fill" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** 0–1 value as five stars, half-star steps — reads like a rating. */
function Stars({ value, label }: { value: number; label: string }) {
  const rating = Math.round(Math.max(0, Math.min(1, value)) * 10) / 2; // 0–5 in 0.5 steps
  return (
    <span className="stars" role="img" aria-label={`${label}: ${rating} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.max(0, Math.min(1, rating - i))} />
      ))}
    </span>
  );
}

/**
 * The four scoring components as star ratings — the score's "show your
 * work". Weights are printed so the formula is never a black box.
 */
export default function ScoreBreakdown({
  components,
  showTrackRecord = true,
}: {
  components: BreakdownData;
  /** False until a real result has been recorded — a meter that shows the
   * same 2.5 stars for every business for months is dead weight. */
  showTrackRecord?: boolean;
}) {
  const rows = showTrackRecord ? ROWS : ROWS.filter((r) => r.key !== "historicalLift");
  return (
    <div className="breakdown breakdown--stars">
      {rows.map((row) => {
        const v = components[row.key];
        return (
          <div className="breakdown__row breakdown__row--stars" key={row.key}>
            <span className="lbl">
              {row.label} · {Math.round(row.weight * 100)}%
              <small>{row.hint}</small>
            </span>
            <Stars value={v} label={row.label} />
          </div>
        );
      })}
      {!showTrackRecord && (
        <p className="mx-0 mt-[6px] mb-0 text-[11.5px] leading-[1.5] text-ink-faint">
          Track record ({Math.round(WEIGHTS.historicalLift * 100)}%) is scored neutral until you record a result.
        </p>
      )}
    </div>
  );
}