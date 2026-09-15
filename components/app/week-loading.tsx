"use client";

import { useEffect, useState } from "react";

/**
 * The wait for a first week, as one picture: a demand line drawing itself
 * upward while the reads run, the one step happening now under it, and an
 * honest clock. Replaces the panels that used to fill in one by one (the
 * analysis, the rising terms, the rivals, the progress list) and read as a
 * page still loading. Everything those panels showed is on the picks and
 * the analysis once the week lands.
 */

export interface LoadingStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
  typicalSec?: number;
}

/** A gently rising line, fixed so the server and the first client frame agree. */
const POINTS = [18, 22, 20, 26, 25, 31, 29, 36, 34, 41, 45, 43, 52, 57, 55, 66, 71, 78, 84, 92];
const W = 640;
const H = 180;

function linePath(): { line: string; area: string; end: { x: number; y: number } } {
  const max = 100;
  const pts = POINTS.map((v, i) => ({ x: (i / (POINTS.length - 1)) * W, y: H - (v / max) * (H - 24) - 8 }));
  // A smooth curve through the points, so the line reads as a trend, not a saw.
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C${cx},${p0.y.toFixed(1)} ${cx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  const end = pts[pts.length - 1];
  return { line: d, area: `${d} L${W},${H} L0,${H} Z`, end };
}

export default function WeekLoading({
  startedAt,
  remainingSec,
  steps,
}: {
  startedAt: string;
  remainingSec: number;
  steps: LoadingStep[];
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = now === null ? 0 : Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");
  const left = Math.max(1, Math.ceil(remainingSec / 60));
  const slow = elapsed > 9 * 60;
  const { line, area, end } = linePath();
  const done = steps.filter((s) => s.state === "done").length;
  const current = steps.find((s) => s.state === "current") ?? steps[steps.length - 1];

  return (
    <div className="wkl" role="status" aria-live="polite">
      <svg className="wkl__chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="wkl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="wkl__grid" />
        ))}
        <path d={area} className="wkl__area" fill="url(#wkl-fill)" />
        <path d={line} className="wkl__line" />
        <circle cx={end.x} cy={end.y} r="5" className="wkl__dot" />
        <circle cx={end.x} cy={end.y} r="5" className="wkl__ring" />
      </svg>
      <div className="wkl__foot">
        <p className="wkl__step">
          <span className="wkl__mark" aria-hidden="true" />
          {current.label}
          {current.typicalSec ? <span className="wkl__typical"> · usually about {current.typicalSec}s</span> : null}
        </p>
        <p className="wkl__clock">
          <span className="wkl__elapsed" aria-label={`${mm} minutes ${ss} seconds elapsed`}>
            {mm}:{ss}
          </span>
          <span className="wkl__left">
            {slow ? "Taking longer than usual. TRND retries on its own." : `${done} of ${steps.length} done · about ${left} min${left === 1 ? "" : "s"} left`}
          </span>
        </p>
      </div>
    </div>
  );
}
