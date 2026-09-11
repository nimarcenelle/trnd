"use client";

import { useState } from "react";

import type { Insight } from "@/lib/recommend/insights";

/**
 * Scannable by default: four bold headlines. "The full read" grows the same
 * rows with their one-sentence details — no duplication, no text wall.
 */
export default function InsightList({
  insights,
  footnote,
}: {
  insights: Insight[];
  footnote?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "0 0 20px" }}>
      <div>
        {insights.map((ins) => (
          <div className="insight" key={ins.kind}>
            <span className={`insight__dot insight__dot--${ins.kind}`} />
            <div>
              <span className="insight__headline">{ins.headline}</span>
              {open && <p className="insight__detail">{ins.detail}</p>}
            </div>
          </div>
        ))}
        {open && footnote && (
          <p className="insight__detail" style={{ margin: "10px 0 0 24px" }}>
            {footnote}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          padding: "10px 0 0",
          cursor: "pointer",
        }}
      >
        <span
          className="chev"
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `1px solid ${open ? "var(--amber)" : "var(--line-strong)"}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: open ? "var(--amber-text)" : "var(--ink-faint)",
            fontSize: 10,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.18s ease",
          }}
        >
          ›
        </span>
        <span className="mono-label" style={{ color: "var(--ink-soft)" }}>
          {open ? "Hide details" : "Show details"}
        </span>
      </button>
    </div>
  );
}
