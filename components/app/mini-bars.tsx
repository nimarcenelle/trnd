import type { BreakdownData } from "./score-breakdown";

/** Tiny 4-bar echo of the score breakdown for list rows. */
export default function MiniBars({ components }: { components: BreakdownData }) {
  const vals = [
    components.normalizedDelta,
    components.serviceMatch,
    components.competitorGap,
    components.historicalLift,
  ];
  return (
    <span
      className="mini-bars"
      role="img"
      aria-label={`Score components: momentum ${vals[0].toFixed(2)}, fit ${vals[1].toFixed(2)}, open door ${vals[2].toFixed(2)}, track record ${vals[3].toFixed(2)}`}
      title={`momentum ${vals[0].toFixed(2)} · fit ${vals[1].toFixed(2)} · open door ${vals[2].toFixed(2)} · track record ${vals[3].toFixed(2)}`}
    >
      {vals.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(12, v * 100)}%` }} />
      ))}
    </span>
  );
}
