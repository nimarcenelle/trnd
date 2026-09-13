import type { MetricDirection } from "@/lib/picks/format";
import { formatMetricValue } from "@/lib/picks/detail";

/**
 * The metric's last 30 points as one line, scaled to its own min and max.
 * Pure SVG, server-rendered. Fewer than two points draws nothing.
 */
export default function DetailSparkline({
  points,
  label,
  direction,
  width = 132,
  height = 36,
}: {
  points: { d: string; v: number }[];
  label: string;
  direction: MetricDirection;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 3;
  const step = (width - pad * 2) / (points.length - 1);
  const yOf = (v: number) => (range === 0 ? height / 2 : pad + (height - pad * 2) * (1 - (v - min) / range));
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)} ${yOf(p.v).toFixed(1)}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const aria = `${label}, last ${points.length} days: ${formatMetricValue(first.v) ?? first.v} to ${formatMetricValue(last.v) ?? last.v}`;

  return (
    <svg
      className={`pickd__spark is-${direction}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={aria}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + (points.length - 1) * step} cy={yOf(last.v)} r={2.6} fill="currentColor" />
    </svg>
  );
}
