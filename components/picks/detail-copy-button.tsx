"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies the given text. Uses the async clipboard when it exists and falls
 * back to selecting a hidden textarea (insecure origins, older webviews).
 */
export default function DetailCopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "btn btn-ghost btn-sm",
  ariaLabel,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function flash(next: "copied" | "failed") {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  function selectFallback(): boolean {
    const area = areaRef.current;
    if (!area) return false;
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }

  async function copy() {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        flash("copied");
        return;
      } catch {
        /* permission denied or insecure origin: fall through */
      }
    }
    flash(selectFallback() ? "copied" : "failed");
  }

  return (
    <>
      <button type="button" className={className} onClick={copy} aria-label={ariaLabel} data-state={state}>
        <span aria-live="polite">{state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : label}</span>
      </button>
      <textarea ref={areaRef} className="pickd__copy-src" value={text} readOnly tabIndex={-1} aria-hidden="true" />
    </>
  );
}
