import type { SignalSeriesPoint } from "@/lib/db/types";

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Mint sparkline (mint = measured reality). Pure SVG, server-renderable,
 * theme-aware via currentColor on a mint-colored wrapper.
 */
export default function Sparkline({
  points,
  width = 220,
  height = 56,
  strokeWidth = 2,
  fluid = false,
  axes = false,
  note = null,
}: {
  points: SignalSeriesPoint[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Stretch to the container's width (viewBox keeps the proportions). */
  fluid?: boolean;
  /** Frame the line with its scale: peak and low, first and last day, now. */
  axes?: boolean;
  /** What the numbers mean — an index is relative to its own peak, and the
   * owner needs to know that before comparing two lines. */
  note?: string | null;
}) {
  if (points.length < 2) {
    return (
      <div
        className="mono-label"
        style={{ height, display: "flex", alignItems: "center", color: "var(--ink-faint)" }}
      >
        No 30-day series on this read yet
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
  const firstX = pad;
  const area = `${d} L${lastX.toFixed(1)} ${height - pad} L${firstX.toFixed(1)} ${height - pad} Z`;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const meanY = pad + (height - pad * 2) * (1 - (mean - min) / range);
  const peakIndex = values.indexOf(max);
  const gradId = `spark-fill-${Math.round(lastX)}-${Math.round(lastY * 10)}-${points.length}`;

  const svg = (
    <svg
      className="sparkline"
      width={fluid ? "100%" : width}
      height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : "xMidYMid meet"}
      role="img"
      aria-label={`30-day interest series ending at ${last.value}`}
      style={{ color: "var(--mint)", overflow: "visible", display: "block", ...(fluid ? { height } : {}) }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="sparkline__area" d={area} fill={`url(#${gradId})`} stroke="none" />
      <path
        className="sparkline__line"
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {axes && (
        <>
          <line
            className="sparkline__base"
            x1={firstX}
            x2={lastX}
            y1={height - pad}
            y2={height - pad}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <line
            className="sparkline__mean"
            x1={firstX}
            x2={lastX}
            y1={meanY}
            y2={meanY}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      <circle className="sparkline__dot" cx={lastX} cy={lastY} r={3.4} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
  if (!axes) return svg;
  return (
    <div className="spark-frame">
      <div className="spark-frame__y" aria-hidden="true">
        <span>{Math.round(max)}</span>
        <span className="spark-frame__mean">avg {Math.round(mean)}</span>
        <span>{Math.round(min)}</span>
      </div>
      <div className="spark-frame__plot">{svg}</div>
      <div className="spark-frame__x">
        <span>{fmtDay(points[0].day)}</span>
        <span className="spark-frame__peak">peak {fmtDay(points[peakIndex].day)}</span>
        <span>
          {fmtDay(last.day)} · now <b>{Math.round(last.value)}</b>
        </span>
      </div>
      {note && <p className="spark-frame__note">{note}</p>}
    </div>
  );
}
