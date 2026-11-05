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

/** The hero's working sample: flip each movable fix and watch one school's odds change. */
export default function OddsToy() {
  const [on, setOn] = useState(() => FACTORS.movable.map(() => false));
  const gained = FACTORS.movable.reduce((sum, f, i) => sum + (on[i] ? f.gain : 0), 0);
  const odds = useCount(FACTORS.odds + gained);

  return (
    <div className="card w-full p-6 shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{FACTORS.school}</span>
        <span className="caption">Sample applicant</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className={`text-[60px] font-semibold tracking-[-0.04em] leading-none tnum ${gained ? "text-brand" : ""}`} aria-live="polite">
          {odds}%
        </div>
        <div className="text-[13px] text-ink-3 text-right tnum">
          {FACTORS.odds}% today
          <br />
          {FACTORS.withFixes}% with all three
        </div>
      </div>
      <div className="mt-5 flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label={`${FACTORS.odds} points today, ${gained} added by fixes`}>
        <span className="bg-locked" style={{ width: `${FACTORS.odds}%` }} />
        <span className="bg-brand transition-[width] duration-300 ease-out" style={{ width: `${gained}%`, marginLeft: gained ? 1 : 0 }} />
      </div>
      <ul className="list-none p-0 m-0 mt-5 divide-y divide-line">
        {FACTORS.movable.map((f, i) => (
          <li key={f.label}>
            <button
              type="button"
              role="switch"
              aria-checked={on[i]}
              onClick={() => setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))}
              className="w-full flex items-center gap-3 py-3 text-left cursor-pointer bg-transparent border-0 px-0 text-ink"
            >
              <span className={`relative shrink-0 w-8 h-[18px] rounded-full transition-colors ${on[i] ? "bg-brand" : "bg-line-strong"}`}>
                <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-bg transition-transform ${on[i] ? "translate-x-[14px]" : ""}`} />
              </span>
              <span className="flex-1 min-w-0 text-[14px]">{f.label}</span>
              <span className={`text-[13px] tnum font-medium whitespace-nowrap ${on[i] ? "text-brand" : "text-ink-3"}`}>+{f.gain} pts</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="caption mt-2">Flip a fix to see what it is worth.</p>
    </div>
  );
}
