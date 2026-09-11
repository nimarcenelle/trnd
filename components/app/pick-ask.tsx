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
    <div className="mt-[22px] pt-[18px] border-t border-dashed border-line">
      <div className="flex gap-3 items-baseline flex-wrap mb-3">
        <span className="mono-label text-(--amber-text)">Ask about this pick</span>
        <span className="text-[12.5px] text-ink-faint leading-[1.5]">
          Why this pick, what to spend, what to say. Or ask for a different angle.
        </span>
      </div>

      {turns.map((t, i) => (
        <div className="bg-bg-2 border border-line rounded-card-sm py-[14px] px-4 mb-[10px]"
          key={`${i}-${t.question.slice(0, 30)}`}
         
        >
          <p className="mx-0 mt-0 mb-[10px] font-mono text-[11.5px] text-ink-faint">
            Q — {t.question}
          </p>
          {t.result.answer.map((p) => (
            <p className="text-[14px] leading-[1.65] text-ink mx-0 mt-0 mb-[10px] max-w-[680px]" key={p.slice(0, 40)}>
              {p}
            </p>
          ))}
          {t.result.assumptions.length > 0 && (
            <div className="mt-2">
              <span className="mono-label block mb-[6px] text-(--amber-text)">
                Assumptions
              </span>
              {t.result.assumptions.map((a) => (
                <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-0 mb-1" key={a.slice(0, 40)}>
                  · {a}
                </p>
              ))}
            </div>
          )}
          {t.result.direction && (
            <div className="mt-3 pt-3 border-t border-dashed border-line flex gap-[14px] items-center flex-wrap">
              <div className="flex-[1_1_320px]">
                <span className="mono-label block mb-1">Suggested direction</span>
                <p className="m-0 text-[13.5px] leading-[1.5] text-ink">{t.result.direction}</p>
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
                <span className="font-mono text-[11px] text-ink-faint">
                  This campaign has launched and can no longer be rewritten.
                </span>
              )}
            </div>
          )}
          {t.result.citations.length > 0 && (
            <details className="mt-[10px]">
              <summary className="mono-label cursor-pointer text-ink-faint">Sources</summary>
              {t.result.citations.map((c) => (
                <p className="text-[12px] leading-[1.5] text-ink-faint mx-0 mt-[6px] mb-0" key={c.claim.slice(0, 40)}>
                  · {c.claim} — <i>{c.source}</i>
                </p>
              ))}
            </details>
          )}
        </div>
      ))}

      <form className="flex gap-[10px] flex-wrap" action={formAction}>
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
        <div className="flex gap-2 flex-wrap mt-3">
          {questions.map((q) => (
            <form key={q} action={formAction}>
              <input type="hidden" name="opportunity_id" value={opportunityId} />
              <input type="hidden" name="question" value={q} />
              <button type="submit" className="pill cursor-pointer bg-bg-1" disabled={pending}>
                {q}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.error && (
        <p className="mx-0 mt-3 mb-0 font-mono text-[12px] text-red">{state.error}</p>
      )}
    </div>
  );
}
