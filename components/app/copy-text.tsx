"use client";

import { useState } from "react";

/** Copies text, ready to paste into notes or a caption; falls back to a prompt when the clipboard is blocked. */
export default function CopyText({ text, label = "Copy script", className = "btn" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
