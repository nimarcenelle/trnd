"use client";

import { useEffect, useState } from "react";

/**
 * Text that writes itself out word by word, for results that arrive all at once (a saved review, a cached rewrite), so
 * they read the same way a streamed one does. `delay` staggers several on one screen. Off for reduced motion.
 */
export default function Typed({ text, animate = true, delay = 0, wordsPerSecond = 45 }: { text: string; animate?: boolean; delay?: number; wordsPerSecond?: number }) {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(animate ? 0 : words.length);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(words.length);
      return;
    }
    setShown(0);
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const n = Math.max(0, Math.floor(((now - start) / 1000) * wordsPerSecond * 2));
      setShown(Math.min(words.length, n));
      if (n < words.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restart only when the text itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate, delay]);
  return <>{words.slice(0, shown).join("")}</>;
}
