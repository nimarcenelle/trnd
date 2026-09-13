"use client";

import { useEffect, useState } from "react";

/**
 * The wait, told honestly: time elapsed since signup, ticking, and how long
 * the remaining steps usually take. A known wait feels half as long as an
 * unknown one. The server and the first client render agree on "0:00";
 * the real elapsed time arrives within a second.
 */
export default function WeekClock({ startedAt, remainingSec }: { startedAt: string; remainingSec: number }) {
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
  return (
    <div className="wk-clock" role="status" aria-live="polite">
      <span className="wk-clock__elapsed" aria-label={`${mm} minutes ${ss} seconds elapsed`}>
        {mm}:{ss}
      </span>
      <span className="wk-clock__left">
        {slow ? "Taking longer than usual. TRND retries on its own." : `about ${left} min${left === 1 ? "" : "s"} left`}
      </span>
    </div>
  );
}
