import type { TrackPoint } from "@/lib/record/track";

/**
 * The hit rate as it moved, one point per scored run in the order they
 * ended. Single series in the brand's mint (no legend: the heading names
 * it), a 0-100% scale so weeks are comparable, the last value labeled, and
 * a native title on every point. The table under it is the full view.
 */
const W = 640;
const H = 160;
const PAD = { t: 14, r: 44, b: 24, l: 34 };

function dayLabel(d: string): string {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function HitRateChart({ points }: { points: TrackPoint[] }) {
  if (points.length < 2) return null;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (points.length - 1);
  const y = (rate: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - rate);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const aria = `Hit rate, ${dayLabel(first.day)} to ${dayLabel(last.day)}: ${Math.round(first.rate * 100)}% to ${Math.round(last.rate * 100)}%`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rec-chart" role="img" aria-label={aria}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="rec-chart__grid" />
          <text x={PAD.l - 6} y={y(g) + 4} className="rec-chart__tick" textAnchor="end">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      <path d={line} className="rec-chart__line" />
      {points.map((p, i) => (
        <circle key={`${p.day}-${i}`} cx={x(i)} cy={y(p.rate)} r={i === points.length - 1 ? 4 : 3} className="rec-chart__dot">
          <title>{`${dayLabel(p.day)}: ${p.won} of ${p.scored} won, ${Math.round(p.rate * 100)}%`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1) + 8} y={y(last.rate) + 4} className="rec-chart__label">
        {Math.round(last.rate * 100)}%
      </text>
      <text x={PAD.l} y={H - 6} className="rec-chart__tick" textAnchor="start">
        {dayLabel(first.day)}
      </text>
      <text x={W - PAD.r} y={H - 6} className="rec-chart__tick" textAnchor="end">
        {dayLabel(last.day)}
      </text>
    </svg>
  );
}
