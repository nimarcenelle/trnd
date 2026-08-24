/**
 * Amber = opportunity. Radial score dial, 0–10, with a strength word so the
 * number is never naked. Server-renderable SVG.
 */
export default function ScoreDial({ score, size = 116 }: { score: number; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, score / 10));
  const label =
    score >= 8 ? "Strong signal" : score >= 6.5 ? "Solid signal" : score >= 5 ? "Worth a look" : "Weak signal";
  return (
    <div className="dial" role="img" aria-label={`Opportunity score ${score.toFixed(1)} out of 10 — ${label}`}>
      <svg width={size} height={size} viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-2)" strokeWidth="8" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="53" textAnchor="middle" fontFamily="var(--disp)" fontWeight="700" fontSize="27" fill="var(--ink)">
          {score.toFixed(1)}
        </text>
        <text x="55" y="70" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" letterSpacing="0.08em" fill="var(--ink-faint)">
          / 10
        </text>
      </svg>
      <span className="dial__label">{label}</span>
    </div>
  );
}
