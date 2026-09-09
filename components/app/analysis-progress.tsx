"use client";

import { useEffect, useState } from "react";

/**
 * The heartbeat for the founding-analysis wait: a staged checklist that
 * advances on wall-clock time since the business was created, so it reads
 * the same across the page's silent refreshes and a hard reload. Stages are
 * the real pipeline (site read → market map → positioning → judging), timed
 * to typical duration rather than reported live — the page swaps to the real
 * dashboard the moment the work actually lands.
 */

const STAGES = [
  { at: 0, label: "Reading your services and site" },
  { at: 8, label: "Mapping your local market" },
  { at: 38, label: "Writing your positioning read" },
  { at: 70, label: "Judging this week's signals against what you sell" },
];

// Past this, say so — the self-heal path retries on its own.
const SLOW_AFTER_S = 180;

export default function AnalysisProgress({ startedAt }: { startedAt: string }) {
  // null until the first tick so the server and first client render agree;
  // the real position arrives within a second.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now === null ? 0 : Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  const current = STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <div className="an-progress" role="status" aria-live="polite">
      {STAGES.map((s, i) => (
        <div
          key={s.label}
          className={`an-progress__row${i < current ? " is-done" : i === current ? " is-current" : ""}`}
        >
          <span className="an-progress__mark" aria-hidden="true" />
          {s.label}
        </div>
      ))}
      {elapsed > SLOW_AFTER_S && (
        <p className="an-progress__slow">
          Taking longer than usual — hang tight, TRND retries on its own.
        </p>
      )}
    </div>
  );
}
