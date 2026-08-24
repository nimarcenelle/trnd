"use client";

import { useState } from "react";

/** A copyable creative block — the unit of the campaign screen. */
export default function CopyBlock({
  label,
  content,
  mono = false,
}: {
  label: string;
  content: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — selection still works */
    }
  }

  return (
    <div className="card" style={{ padding: "16px 18px", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="mono-label">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="btn btn-ghost btn-sm"
          style={{ padding: "4px 12px", fontSize: 11.5, color: copied ? "var(--mint)" : undefined, borderColor: copied ? "var(--mint)" : undefined }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <div
        style={{
          fontFamily: mono ? "var(--mono)" : "var(--body)",
          fontSize: mono ? 12.5 : 14.5,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          color: "var(--ink)",
        }}
      >
        {content}
      </div>
    </div>
  );
}
