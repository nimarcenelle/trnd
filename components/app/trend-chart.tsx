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

export default function TrendChart({ points }: { points: SignalSeriesPoint[] }) {
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
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${(H - PAD.b).toFixed(1)} L${PAD.l} ${(H - PAD.b).toFixed(1)} Z`;
    const grid = [0.25, 0.55, 0.85].map((f) => ({
      yPos: PAD.t + (H - PAD.t - PAD.b) * f,
      val: hi - (hi - lo) * f,
    }));
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
  const delta = first.value > 0 ? Math.round(((last.value - first.value) / first.value) * 100) : 0;
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
        <path d={geom.area} fill="var(--mint)" opacity="0.1" />
        <path d={geom.line} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* endpoint dot + always-on value label */}
        <circle cx={geom.x(points.length - 1)} cy={geom.y(last.value)} r="3.5" fill="var(--mint)" />
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
