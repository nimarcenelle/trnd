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
  const [fixed, setFixed] = useState(false);
  const target = fixed ? FACTORS.withFixes : FACTORS.odds;
  const odds = useCount(target);
  const gain = FACTORS.withFixes - FACTORS.odds;
  const pct = Math.round((gain / FACTORS.odds) * 100);
  return (
    <div className="card w-full p-6 shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{FACTORS.school}</span>
        <span className="caption">Sample applicant</span>
      </div>
      <div className="mt-4 grid grid-cols-2 p-1 rounded-full bg-muted text-[13px] font-medium" role="group" aria-label="Essays">
        {[
          { on: false, label: "Essays as written" },
          { on: true, label: "Essays fixed" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={fixed === o.on}
            onClick={() => setFixed(o.on)}
            className={`h-8 rounded-full transition-colors ${fixed === o.on ? "bg-ground text-ink shadow-[var(--shadow-sm)]" : "text-ink-3 hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-[60px] font-semibold tracking-[-0.04em] leading-none tnum">{odds}%</div>
        <div className="text-[13px] text-ink-3 text-right tnum">
          GPA {FACTORS.gpa} · SAT {FACTORS.test}
          <br />
          {fixed ? <span className="text-brand font-medium">a {pct}% better chance of getting in</span> : "odds today"}
        </div>
      </div>
      <div className="mt-5 flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label={`${target} percent ${fixed ? "with essays fixed" : "today"}`}>
        <span className="bg-locked" style={{ width: `${FACTORS.odds}%` }} />
        <span className="bg-brand transition-[width] duration-300" style={{ width: fixed ? `${gain}%` : "0%" }} />
      </div>
      <ul className="list-none p-0 m-0 mt-5 divide-y divide-line">
        {FACTORS.movable.map((f) => (
          <li key={f.label} className="flex items-baseline justify-between gap-3 py-3 text-[14px]">
            <span>{f.label}</span>
            {fixed && f.kind === "essays" ? (
              <span className="text-[13px] font-medium text-brand whitespace-nowrap tnum">{pct}% better chance</span>
            ) : (
              <span className="text-[13px] text-ink-3 whitespace-nowrap">Depends on what&apos;s in them</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
