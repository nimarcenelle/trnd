"use client";

import { useActionState } from "react";

import BuildCampaignButton from "@/components/app/build-campaign-button";
import { askPickAction, type AskState } from "@/lib/intel/ask-action";

/**
 * The pick's own Ask box. Sits under the recommendation it is about, seeded
 * with the questions this owner would ask about this pick; every answer is
 * grounded in the same facts the meters show. When an answer implies a
 * different way to run the pick — another menu item, a different offer, a
 * different audience — it ends in a direction and a button that builds (or
 * rewrites) the campaign that way.
 */
export default function PickAsk({
  opportunityId,
  questions,
  hasCampaign,
  rebuildable,
}: {
  opportunityId: string;
  /** Suggested openers — model-written for this pick when the read exists,
   * deterministic otherwise. */
  questions: string[];
  hasCampaign: boolean;
  /** False once the pick's campaign has launched — results point at it. */
  rebuildable: boolean;
}) {
  const [state, formAction, pending] = useActionState<AskState, FormData>(askPickAction, { turns: [] });
  const turns = state.turns ?? [];

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 12 }}>
        <span className="mono-label" style={{ color: "var(--amber-text)" }}>Ask about this pick</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>
          Why this pick, what to spend, what to say. Or ask for a different angle.
        </span>
      </div>

      {turns.map((t, i) => (
        <div
          key={`${i}-${t.question.slice(0, 30)}`}
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: 10 }}
        >
          <p style={{ margin: "0 0 10px", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
            Q — {t.question}
          </p>
          {t.result.answer.map((p) => (
            <p key={p.slice(0, 40)} style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink)", margin: "0 0 10px", maxWidth: 680 }}>
              {p}
            </p>
          ))}
          {t.result.assumptions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="mono-label" style={{ display: "block", marginBottom: 6, color: "var(--amber-text)" }}>
                Assumptions
              </span>
              {t.result.assumptions.map((a) => (
                <p key={a.slice(0, 40)} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "0 0 4px" }}>
                  · {a}
                </p>
              ))}
            </div>
          )}
          {t.result.direction && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px" }}>
                <span className="mono-label" style={{ display: "block", marginBottom: 4 }}>Suggested direction</span>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)" }}>{t.result.direction}</p>
              </div>
              {rebuildable ? (
                <BuildCampaignButton
                  opportunityId={opportunityId}
                  direction={t.result.direction}
                  rebuild={hasCampaign}
                  className="btn btn-primary btn-sm"
                >
                  {hasCampaign ? "Rewrite the campaign" : "Build the campaign"}
                </BuildCampaignButton>
              ) : (
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>
                  This campaign has launched and can no longer be rewritten.
                </span>
              )}
            </div>
          )}
          {t.result.citations.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary className="mono-label" style={{ cursor: "pointer", color: "var(--ink-faint)" }}>Sources</summary>
              {t.result.citations.map((c) => (
                <p key={c.claim.slice(0, 40)} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-faint)", margin: "6px 0 0" }}>
                  · {c.claim} — <i>{c.source}</i>
                </p>
              ))}
            </details>
          )}
        </div>
      ))}

      <form action={formAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input
          key={turns.length}
          name="question"
          placeholder={turns.length > 0 ? "Ask a follow-up" : "Ask about this pick"}
          aria-label="Your question about this pick"
          maxLength={400}
          className="input"
          style={{ flex: "1 1 320px" }}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending}>
          {pending ? "Thinking…" : turns.length > 0 ? "Follow up" : "Ask"}
        </button>
      </form>

      {turns.length === 0 && questions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {questions.map((q) => (
            <form key={q} action={formAction}>
              <input type="hidden" name="opportunity_id" value={opportunityId} />
              <input type="hidden" name="question" value={q} />
              <button type="submit" className="pill" disabled={pending} style={{ cursor: "pointer", background: "var(--bg-1)" }}>
                {q}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.error && (
        <p style={{ margin: "12px 0 0", fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)" }}>{state.error}</p>
      )}
    </div>
  );
}
