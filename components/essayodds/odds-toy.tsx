"use client";

import { useEffect, useRef, useState } from "react";

import { FACTORS } from "./sample";

/** Counts to `target` over a short tween, or jumps there when motion is reduced. */
function useCount(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 350);
      const value = Math.round(origin + (target - origin) * (1 - (1 - t) ** 3));
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** The hero's sample: one school's odds for one applicant, and the parts of the application that still move them. */
export default function OddsToy() {
  const odds = useCount(FACTORS.odds);
  return (
    <div className="card w-full p-6 shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{FACTORS.school}</span>
        <span className="caption">Sample applicant</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-[60px] font-semibold tracking-[-0.04em] leading-none tnum">{odds}%</div>
        <div className="text-[13px] text-ink-3 text-right tnum">
          GPA {FACTORS.gpa} · SAT {FACTORS.test}
          <br />
          odds today
        </div>
      </div>
      <div className="mt-5 flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label={`${FACTORS.odds} percent today`}>
        <span className="bg-locked" style={{ width: `${FACTORS.odds}%` }} />
      </div>
      <ul className="list-none p-0 m-0 mt-5 divide-y divide-line">
        {FACTORS.movable.map((f) => (
          <li key={f.label} className="flex items-baseline justify-between gap-3 py-3 text-[14px]">
            <span>{f.label}</span>
            <span className="text-[13px] text-ink-3 whitespace-nowrap">Depends on what&apos;s in them</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
