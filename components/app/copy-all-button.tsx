"use client";

import { useState } from "react";

export default function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {copied ? "Copied everything ✓" : "Copy all"}
    </button>
  );
}
