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
        <div className="panel mb-[14px]" key={`${i}-${t.question.slice(0, 30)}`}>
          <p className="mx-0 mt-0 mb-[14px] font-mono text-[11.5px] text-ink-faint">
            Q — {t.question}
          </p>
          {t.result.answer.map((p) => (
            <p className="text-[14.5px] leading-[1.65] text-ink mx-0 mt-0 mb-3 max-w-[720px]" key={p.slice(0, 40)}>
              {p}
            </p>
          ))}
          {t.result.assumptions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-line">
              <span className="mono-label block mb-2 text-(--amber-text)">
                Assumed — correct me and ask again
              </span>
              {t.result.assumptions.map((a) => (
                <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-[5px]" key={a.slice(0, 40)}>
                  · {a}
                </p>
              ))}
            </div>
          )}
          {t.result.citations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-line">
              <span className="mono-label block mb-2">Where that comes from</span>
              {t.result.citations.map((c) => (
                <p className="text-[12px] leading-[1.5] text-ink-faint mx-0 mt-0 mb-[5px]" key={c.claim.slice(0, 40)}>
                  · {c.claim} — <i>{c.source}</i>
                </p>
              ))}
            </div>
          )}
          <p className="mx-0 mt-[14px] mb-0 font-mono text-[10.5px] text-ink-faint">
            {t.result.insufficient
              ? "Honest gap: even a reasoned estimate would be a guess here."
              : `Answered by ${t.result.model} — your data, plus labeled assumptions.`}
          </p>
        </div>
      ))}

      <form className="flex gap-[10px] flex-wrap" action={formAction}>
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
        <div className="flex gap-2 flex-wrap mt-[14px]">
          {SUGGESTIONS.map((s) => (
            <form key={s} action={formAction}>
              <input type="hidden" name="question" value={s} />
              <button type="submit" className="pill cursor-pointer bg-bg-1" disabled={pending}>
                {s}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.error && (
        <p className="mt-[14px] font-mono text-[12px] text-red">{state.error}</p>
      )}
    </div>
  );
}
