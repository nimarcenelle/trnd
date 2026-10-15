"use client";

import { useState } from "react";

/** Copies the brief as plain text, ready to paste to a creator or into Slack. */
export default function CopyBrief({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm mt-3"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy the brief:", text);
        }
      }}
    >
      {done ? "Copied" : "Copy brief"}
    </button>
  );
}
