"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Quietly re-fetches the page while a background job (the founding analysis,
 * the first ranking, this week's written note) is landing — the user never
 * has to reload. `times` bounds the polling: a job that failed server-side
 * never lands, and a page that polls forever is a battery leak nobody sees.
 *
 * It defers rather than fires when the person is mid-thought. A refresh
 * swaps server-rendered content underneath them, and it landed while an
 * owner was typing into the Ask box — the paragraph they were reading was
 * replaced by a rewritten one between two keystrokes. So a tick is skipped,
 * not spent, when the tab is hidden, when focus is in a field, or when
 * there is a text selection on the page. The job is still landing; the
 * refresh just waits for a moment when nobody is mid-sentence.
 */
function busy(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState === "hidden") return true;
  const el = document.activeElement;
  if (el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((el as HTMLElement).isContentEditable) return true;
  }
  // Mid-copy: replacing the DOM drops the selection.
  const sel = document.getSelection();
  if (sel && !sel.isCollapsed && String(sel).trim().length > 0) return true;
  return false;
}

export default function AutoRefresh({
  everyMs = 12000,
  times = Infinity,
}: {
  everyMs?: number;
  times?: number;
}) {
  const router = useRouter();
  const left = useRef(times);
  useEffect(() => {
    left.current = times;
    const id = setInterval(() => {
      // A skipped tick costs nothing but a few seconds; an interrupted one
      // costs the sentence someone was writing.
      if (busy()) return;
      router.refresh();
      if (--left.current <= 0) clearInterval(id);
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, times]);
  return null;
}
