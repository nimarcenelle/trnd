import { WEIGHTS } from "@/lib/scoring";

export interface BreakdownData {
  normalizedDelta: number;
  serviceMatch: number;
  competitorGap: number;
  historicalLift: number;
}

const ROWS = [
  { key: "normalizedDelta", label: "Momentum", weight: WEIGHTS.normalizedDelta, hint: "how fast it's rising" },
  { key: "serviceMatch", label: "Fit", weight: WEIGHTS.serviceMatch, hint: "matches what you sell" },
  { key: "competitorGap", label: "Open door", weight: WEIGHTS.competitorGap, hint: "competitor gap" },
  { key: "historicalLift", label: "Track record", weight: WEIGHTS.historicalLift, hint: "similar campaigns" },
] as const;

/**
 * The four scoring components as labeled meters — the score's "show your
 * work". Weights are printed so the formula is never a black box.
 */
export default function ScoreBreakdown({ components }: { components: BreakdownData }) {
  return (
    <div className="breakdown">
      {ROWS.map((row) => {
        const v = components[row.key];
        return (
          <div className="breakdown__row" key={row.key}>
            <span className="lbl">
              {row.label} · {Math.round(row.weight * 100)}%
              <small>{row.hint}</small>
            </span>
            <div className="breakdown__track">
              <div className="breakdown__fill" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="val">{v.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
