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

/** The hero's working sample: the round is a sized switch; what essays and letters do depends on what's in them. */
export default function OddsToy() {
  const round = FACTORS.movable.find((f) => f.kind === "round")!;
  const [on, setOn] = useState(false);
  const gained = on ? (round.gain ?? 0) : 0;
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
          up to {FACTORS.withFixes}%
        </div>
      </div>
      <div className="mt-5 flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label={`${FACTORS.odds} points today, ${gained} added`}>
        <span className="bg-locked" style={{ width: `${FACTORS.odds}%` }} />
        <span className="bg-brand transition-[width] duration-300 ease-out" style={{ width: `${gained}%`, marginLeft: gained ? 1 : 0 }} />
      </div>
      <ul className="list-none p-0 m-0 mt-5 divide-y divide-line">
        {FACTORS.movable.map((f) =>
          f.kind === "round" ? (
            <li key={f.label}>
              <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)} className="w-full flex items-center gap-3 py-3 text-left cursor-pointer bg-transparent border-0 px-0 text-ink">
                <span className={`relative shrink-0 w-8 h-[18px] rounded-full transition-colors ${on ? "bg-brand" : "bg-line-strong"}`}>
                  <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-bg transition-transform ${on ? "translate-x-[14px]" : ""}`} />
                </span>
                <span className="flex-1 min-w-0 text-[14px]">{f.label}</span>
                <span className={`text-[13px] tnum font-medium whitespace-nowrap ${on ? "text-brand" : "text-ink-3"}`}>+{f.gain} pts</span>
              </button>
            </li>
          ) : (
            <li key={f.label} className="flex items-baseline justify-between gap-3 py-3 text-[14px]">
              <span>{f.label}</span>
              <span className="text-[13px] text-ink-3 whitespace-nowrap">Depends on what&apos;s in them</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
