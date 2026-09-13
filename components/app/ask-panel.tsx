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
 * replays the thread, so follow-ups build on the answers before them.
 * Rendered inside one card: the turns run down it, the question box last. */
export default function AskPanel() {
  const [state, formAction, pending] = useActionState<AskState, FormData>(askAction, { turns: [] });
  const turns = state.turns ?? [];

  return (
    <div>
      {turns.length > 0 && (
        <div className="ask__turns">
          {turns.map((t, i) => (
            <div className="ask__turn" key={`${i}-${t.question.slice(0, 30)}`}>
              <p className="ask__q">Q · {t.question}</p>
              {t.result.answer.map((p) => (
                <p className="ask__a" key={p.slice(0, 40)}>
                  {p}
                </p>
              ))}
              {t.result.assumptions.length > 0 && (
                <div className="ask__block">
                  <span className="mono-label">Assumed</span>
                  {t.result.assumptions.map((a) => (
                    <p key={a.slice(0, 40)}>{a}</p>
                  ))}
                </div>
              )}
              {t.result.citations.length > 0 && (
                <div className="ask__block">
                  <span className="mono-label">Sources</span>
                  {t.result.citations.map((c) => (
                    <p key={c.claim.slice(0, 40)}>
                      {c.claim} <i>· {c.source}</i>
                    </p>
                  ))}
                </div>
              )}
              <p className="ask__foot">
                {t.result.insufficient ? "Not enough data to answer this well." : `Answered by ${t.result.model}.`}
              </p>
            </div>
          ))}
        </div>
      )}

      <form className="ask__form" action={formAction}>
        <input
          key={turns.length}
          className="input"
          name="question"
          placeholder={turns.length > 0 ? "Ask a follow-up" : "Ask about your market, your money, your competitors"}
          aria-label="Your question"
          maxLength={400}
        />
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Thinking…" : turns.length > 0 ? "Follow up" : "Ask"}
        </button>
      </form>

      {turns.length === 0 && !state.error && (
        <div className="ask__suggest">
          {SUGGESTIONS.map((s) => (
            <form key={s} action={formAction}>
              <input type="hidden" name="question" value={s} />
              <button type="submit" className="pill" disabled={pending}>
                {s}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.error && <p className="ask__error">{state.error}</p>}
    </div>
  );
}
