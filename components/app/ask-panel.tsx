"use client";

import { useActionState } from "react";

import { askAction, type AskState } from "@/lib/intel/ask-action";

const SUGGESTIONS = [
  "What should I spend money on this week?",
  "What are my competitors doing right now?",
  "What's the most I can realistically make per month?",
  "Why is this week's pick graded the way it is?",
];

/** The Ask surface: a running conversation with the analyst — every ask
 * replays the thread, so follow-ups build on the answers before them. */
export default function AskPanel() {
  const [state, formAction, pending] = useActionState<AskState, FormData>(askAction, { turns: [] });
  const turns = state.turns ?? [];

  return (
    <div>
      {turns.map((t, i) => (
        <div className="panel" style={{ marginBottom: 14 }} key={`${i}-${t.question.slice(0, 30)}`}>
          <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
            Q — {t.question}
          </p>
          {t.result.answer.map((p) => (
            <p key={p.slice(0, 40)} style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink)", margin: "0 0 12px", maxWidth: 720 }}>
              {p}
            </p>
          ))}
          {t.result.assumptions.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
              <span className="mono-label" style={{ display: "block", marginBottom: 8, color: "var(--amber-text)" }}>
                Assumed — correct me and ask again
              </span>
              {t.result.assumptions.map((a) => (
                <p key={a.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 5px" }}>
                  · {a}
                </p>
              ))}
            </div>
          )}
          {t.result.citations.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
              <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>Where that comes from</span>
              {t.result.citations.map((c) => (
                <p key={c.claim.slice(0, 40)} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-faint)", margin: "0 0 5px" }}>
                  · {c.claim} — <i>{c.source}</i>
                </p>
              ))}
            </div>
          )}
          <p style={{ margin: "14px 0 0", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>
            {t.result.insufficient
              ? "Honest gap: even a reasoned estimate would be a guess here."
              : `Answered by ${t.result.model} — your data, plus labeled assumptions.`}
          </p>
        </div>
      ))}

      <form action={formAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          key={turns.length}
          name="question"
          placeholder={
            turns.length > 0
              ? "Ask a follow-up — the analyst remembers the thread…"
              : "Ask about your market, your money, your competitors…"
          }
          aria-label="Your question"
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
          {pending ? "Thinking…" : turns.length > 0 ? "Follow up" : "Ask"}
        </button>
      </form>

      {turns.length === 0 && !state.error && (
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
    </div>
  );
}
