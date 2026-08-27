"use client";

import { useActionState } from "react";

import { askAction, type AskState } from "@/lib/intel/ask-action";

const SUGGESTIONS = [
  "What should I spend money on this week?",
  "What are my competitors doing right now?",
  "What do customers praise us for?",
  "Why is this week's pick graded the way it is?",
];

/** The Ask surface: one question in, a cited answer out. */
export default function AskPanel() {
  const [state, formAction, pending] = useActionState<AskState, FormData>(askAction, {});

  return (
    <div>
      <form action={formAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          name="question"
          placeholder="Ask about your market, your competitors, your results…"
          aria-label="Your question"
          defaultValue={state.question}
          maxLength={400}
          style={{
            flex: "1 1 380px",
            fontFamily: "var(--body)",
            fontSize: 14.5,
            background: "var(--bg-1)",
            border: "1px solid var(--line-strong)",
            color: "var(--ink)",
            padding: "13px 16px",
            borderRadius: "var(--radius-sm)",
            outline: "none",
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Reading your data…" : "Ask"}
        </button>
      </form>

      {!state.result && !state.error && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {SUGGESTIONS.map((s) => (
            <form key={s} action={formAction}>
              <input type="hidden" name="question" value={s} />
              <button type="submit" className="pill" disabled={pending} style={{ cursor: "pointer", background: "var(--bg-1)" }}>
                {s}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.error && (
        <p style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)" }}>{state.error}</p>
      )}

      {state.result && (
        <div className="panel" style={{ marginTop: 18 }}>
          {state.question && (
            <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
              Q — {state.question}
            </p>
          )}
          {state.result.answer.map((p) => (
            <p key={p.slice(0, 40)} style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink)", margin: "0 0 12px", maxWidth: 720 }}>
              {p}
            </p>
          ))}
          {state.result.citations.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
              <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Where that comes from</span>
              {state.result.citations.map((c) => (
                <p key={c.claim.slice(0, 40)} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-faint)", margin: "0 0 5px" }}>
                  · {c.claim} — <i>{c.source}</i>
                </p>
              ))}
            </div>
          )}
          <p style={{ margin: "14px 0 0", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>
            {state.result.insufficient
              ? "Honest gap: the data doesn't fully answer this yet."
              : `Answered by ${state.result.model} from your data only.`}
          </p>
        </div>
      )}
    </div>
  );
}
