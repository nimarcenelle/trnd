import type { SignalSeriesPoint } from "@/lib/db/types";

/**
 * Mint sparkline (mint = measured reality). Pure SVG, server-renderable,
 * theme-aware via currentColor on a mint-colored wrapper.
 */
export default function Sparkline({
  points,
  width = 220,
  height = 56,
  strokeWidth = 2,
}: {
  points: SignalSeriesPoint[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  if (points.length < 2) {
    return (
      <div
        className="mono-label"
        style={{ height, display: "flex", alignItems: "center", color: "var(--ink-faint)" }}
      >
        series pending — next ingest fills this in
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = strokeWidth * 2;
  const step = (width - pad * 2) / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = pad + (height - pad * 2) * (1 - (p.value - min) / range);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const last = points[points.length - 1];
  const lastX = pad + (points.length - 1) * step;
  const lastY = pad + (height - pad * 2) * (1 - (last.value - min) / range);

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`30-day interest series ending at ${last.value}`}
      style={{ color: "var(--mint)", overflow: "visible" }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3.2} fill="currentColor" />
    </svg>
  );
}
