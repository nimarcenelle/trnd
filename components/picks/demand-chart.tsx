/**
 * The demand line on a pick, in the shape of the dashboard's demand graph:
 * an area under a line, a light grid, the first and last day named. The
 * scale is the term's own (an index), so the height is only comparable with
 * itself; the chips beside it say what moved. Pure SVG, server-rendered.
 */
const W = 320;
const H = 120;
const PAD = { t: 10, r: 10, b: 22, l: 6 };

function dayLabel(d: string): string {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function DemandChart({
  points,
  label,
  tone,
}: {
  points: { d: string; v: number }[];
  label: string;
  tone: "up" | "down" | "flat";
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (points.length - 1);
  const y = (v: number) => (range === 0 ? (H - PAD.b + PAD.t) / 2 : PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / range));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const floor = (H - PAD.b).toFixed(1);
  const area = `${line} L${x(points.length - 1).toFixed(1)},${floor} L${x(0).toFixed(1)},${floor} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const aria = `${label}, ${dayLabel(first.d)} to ${dayLabel(last.d)}: ${Math.round(first.v)} to ${Math.round(last.v)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`dchart is-${tone}`} role="img" aria-label={aria}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + (H - PAD.t - PAD.b) * g} y2={PAD.t + (H - PAD.t - PAD.b) * g} className="dchart__grid" />
      ))}
      <path d={area} className="dchart__area" />
      <path d={line} className="dchart__line" />
      <circle cx={x(points.length - 1)} cy={y(last.v)} r="3.5" className="dchart__dot" />
      <text x={PAD.l} y={H - 6} className="dchart__tick" textAnchor="start">
        {dayLabel(first.d)}
      </text>
      <text x={W - PAD.r} y={H - 6} className="dchart__tick" textAnchor="end">
        {dayLabel(last.d)}
      </text>
    </svg>
  );
}
