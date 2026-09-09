"use client";

import { useMemo, useRef, useState } from "react";

import type { SignalSeriesPoint } from "@/lib/db/types";

/**
 * 30-day demand trend. Mint = measured reality. Single series: no legend
 * (the panel title names it), direct label on the endpoint, recessive grid,
 * crosshair + tooltip on hover.
 */
const W = 660;
const H = 200;
const PAD = { t: 16, r: 52, b: 26, l: 40 };

function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function TrendChart({
  points,
  weeklyDeltaPct = null,
  unitHint = "relative demand for this term — higher means more people searching",
}: {
  points: SignalSeriesPoint[];
  /** The ranking's week-over-week read for this term — shown beside the
   * 30-day read so the two windows explain each other instead of appearing
   * to contradict. */
  weeklyDeltaPct?: number | null;
  /** One plain-language line saying what the y-axis number IS. */
  unitHint?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lo = Math.max(0, min - (max - min) * 0.15);
    const hi = max + (max - min) * 0.1 || max + 1;
    const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (points.length - 1);
    const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
    // Catmull-Rom → cubic bézier: the measured points stay exact, the line
    // between them reads as a trend instead of a polyline.
    const px = points.map((p, i) => ({ cx: x(i), cy: y(p.value) }));
    let line = `M${px[0].cx.toFixed(1)} ${px[0].cy.toFixed(1)}`;
    for (let i = 0; i < px.length - 1; i++) {
      const p0 = px[Math.max(0, i - 1)];
      const p1 = px[i];
      const p2 = px[i + 1];
      const p3 = px[Math.min(px.length - 1, i + 2)];
      const c1x = p1.cx + (p2.cx - p0.cx) / 6;
      const c1y = p1.cy + (p2.cy - p0.cy) / 6;
      const c2x = p2.cx - (p3.cx - p1.cx) / 6;
      const c2y = p2.cy - (p3.cy - p1.cy) / 6;
      line += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.cx.toFixed(1)} ${p2.cy.toFixed(1)}`;
    }
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${(H - PAD.b).toFixed(1)} L${PAD.l} ${(H - PAD.b).toFixed(1)} Z`;
    // Round-number gridlines: pick a 1/2/5×10ⁿ step, draw the ticks that fit.
    const span = hi - lo || 1;
    const rawStep = span / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s2) => s2 >= rawStep) ?? mag * 10;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const grid = ticks.map((val) => ({ yPos: y(val), val }));
    return { x, y, line, area, grid, lo, hi };
  }, [points]);

  if (!geom || points.length < 2) {
    return (
      <div className="mono-label" style={{ padding: "26px 0", color: "var(--ink-faint)" }}>
        series pending — next ingest fills this in
      </div>
    );
  }

  const last = points[points.length - 1];
  const first = points[0];
  // Month read from week-sized averages, not two endpoint days — a single
  // dip on the first or last day must not fake a trend.
  const win = Math.max(2, Math.min(7, Math.floor(points.length / 2)));
  const avg = (arr: SignalSeriesPoint[]) => arr.reduce((a, p) => a + p.value, 0) / arr.length;
  const early = avg(points.slice(0, win));
  const late = avg(points.slice(-win));
  const delta = early > 0 ? Math.round(((late - early) / early) * 100) : 0;
  const weekly = typeof weeklyDeltaPct === "number" ? Math.round(weeklyDeltaPct) : null;
  // The two windows disagreeing is information, not a bug — say so.
  const crossNote =
    weekly !== null && Math.abs(weekly) >= 5 && Math.abs(delta) >= 5 && weekly > 0 !== delta > 0
      ? weekly > 0
        ? "Both reads are true: this week is up inside a month that's been cooling — a fresh push worth catching early, not a peak you missed."
        : "Both reads are true: this week dipped inside a month that's still up — watch next week before calling it a fade."
      : null;
  const mid = points[Math.floor(points.length / 2)];
  const h = hover !== null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  return (
    <div className="trend-chart" ref={wrapRef}>
      <div className="trend-chart__summary" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span className="trend-chart__now">{Math.round(last.value)}</span>
        {weekly !== null && (
          <span
            className={`delta-chip${weekly < 0 ? " delta-chip--down" : ""}`}
            title="Change against the week before — the number the ranking scores on"
          >
            {weekly >= 0 ? "↑" : "↓"}
            {Math.abs(weekly)}% vs last week
          </span>
        )}
        <span
          className={`delta-chip${delta < 0 ? " delta-chip--down" : ""}`}
          title="Average of the last week of this window against its first week"
        >
          {delta >= 0 ? "↑" : "↓"}
          {Math.abs(delta)}% over 30 days
        </span>
      </div>
      <p style={{ margin: "2px 0 10px", fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--ink-faint)" }}>
        {unitHint}
      </p>
      {crossNote && (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)" }}>
          {crossNote}
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`30-day demand series from ${fmtDay(first.day)} to ${fmtDay(last.day)}, ending at ${last.value} (${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}%)`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* recessive grid + value labels */}
        {geom.grid.map((g) => (
          <g key={g.yPos}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.yPos} y2={g.yPos} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={g.yPos + 3.5} textAnchor="end" fontSize="9.5" fontFamily="var(--mono)" fill="var(--ink-faint)">
              {Math.round(g.val)}
            </text>
          </g>
        ))}
        {/* x labels: first / mid / last */}
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
          <text
            key={i}
            x={geom.x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="9.5"
            fontFamily="var(--mono)"
            fill="var(--ink-faint)"
          >
            {fmtDay(points[i].day)}
          </text>
        ))}
        {/* area + line */}
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.22" />
            <stop offset="70%" stopColor="var(--mint)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geom.area} fill="url(#trendFill)" />
        <path d={geom.line} fill="none" stroke="var(--mint)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {/* endpoint: soft halo + dot + always-on value label */}
        <circle cx={geom.x(points.length - 1)} cy={geom.y(last.value)} r="9" fill="var(--mint)" opacity="0.15" />
        <circle cx={geom.x(points.length - 1)} cy={geom.y(last.value)} r="3.5" fill="var(--mint)" stroke="var(--bg-1)" strokeWidth="1.5" />
        <text
          x={geom.x(points.length - 1) + 8}
          y={geom.y(last.value) + 3.5}
          fontSize="11"
          fontWeight="600"
          fontFamily="var(--mono)"
          fill="var(--mint-text)"
        >
          {Math.round(last.value)}
        </text>
        {/* hover crosshair */}
        {h && hover !== null && (
          <g>
            <line x1={geom.x(hover)} x2={geom.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={geom.x(hover)} cy={geom.y(h.value)} r="4" fill="var(--mint)" stroke="var(--bg-1)" strokeWidth="2" />
          </g>
        )}
        {/* invisible hit layer */}
        <rect x={PAD.l} y={0} width={W - PAD.l - PAD.r} height={H} fill="transparent" />
        <title>
          {mid ? `${fmtDay(first.day)} – ${fmtDay(last.day)}` : ""}
        </title>
      </svg>
      {h && hover !== null && (
        <div
          className="trend-tooltip"
          style={{
            left: `${(geom.x(hover) / W) * 100}%`,
            top: `${(geom.y(h.value) / H) * 100}%`,
          }}
        >
          {fmtDay(h.day)} · <b>{Math.round(h.value)}</b>
        </div>
      )}
    </div>
  );
}
