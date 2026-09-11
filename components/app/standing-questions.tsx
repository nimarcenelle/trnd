import SubmitButton from "@/components/app/submit-button";
import type { StandingQuestion } from "@/lib/db/types";
import { MAX_STANDING_QUESTIONS } from "@/lib/intel/standing";
import { addStandingQuestionAction, removeStandingQuestionAction } from "@/lib/intel/standing-actions";

const fmtWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The questions TRND keeps answering. Each one is re-answered every Monday
 * against that week's facts and memory, with what moved since the last
 * answer — so the panel reads differently every week by construction. The
 * owner adds one in their own words or picks a suggested opener.
 */
export default function StandingQuestions({
  questions,
  suggestions,
  modelReady,
}: {
  questions: StandingQuestion[];
  suggestions: string[];
  modelReady: boolean;
}) {
  const room = questions.length < MAX_STANDING_QUESTIONS;
  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel__head">
        <span className="panel__title">Questions TRND keeps answering</span>
        <span className="panel__meta">re-answered every Monday · what moved since last time</span>
      </div>

      {questions.length === 0 && (
        <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 640 }}>
          Ask something you&apos;ll want answered every week — who&apos;s advertising against you, whether
          your price still holds, what&apos;s coming — and TRND answers it fresh each Monday, with what
          changed since the last answer.
        </p>
      )}

      {questions.map((q, i) => (
        <div
          key={q.id}
          style={{
            padding: "14px 0",
            borderTop: i === 0 ? "none" : "1px dashed var(--line)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5 }}>{q.question}</span>
            <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span className="mono-label">
                {q.answered_week ? `Answered for the week of ${fmtWeek(q.answered_week)}` : modelReady ? "First answer on Monday" : "Not answered yet"}
              </span>
              <form action={removeStandingQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="mono-label" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", padding: 0 }}>
                  stop asking
                </button>
              </form>
            </span>
          </div>
          {q.changed && (
            <p style={{ margin: "8px 0 6px", fontSize: 13.5, lineHeight: 1.55, color: "var(--amber-text)" }}>
              <span className="mono-label" style={{ color: "var(--amber-text)", marginRight: 8 }}>Since last week</span>
              {q.changed}
            </p>
          )}
          {q.answer.map((p) => (
            <p key={p.slice(0, 40)} style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 680 }}>
              {p}
            </p>
          ))}
        </div>
      ))}

      {room && (
        <div style={{ marginTop: questions.length > 0 ? 14 : 0, paddingTop: questions.length > 0 ? 14 : 0, borderTop: questions.length > 0 ? "1px dashed var(--line)" : "none" }}>
          <form action={addStandingQuestionAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              name="question"
              placeholder="A question you want answered every week…"
              aria-label="New standing question"
              maxLength={240}
              style={{
                flex: "1 1 320px",
                fontFamily: "var(--body)",
                fontSize: 14,
                background: "var(--bg-1)",
                border: "1px solid var(--line-strong)",
                color: "var(--ink)",
                padding: "11px 14px",
                borderRadius: "var(--radius-sm)",
                outline: "none",
              }}
            />
            <SubmitButton className="btn btn-ghost btn-sm" pendingLabel={modelReady ? "Answering…" : "Adding…"}>
              Keep asking
            </SubmitButton>
          </form>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {suggestions.map((s) => (
                <form key={s} action={addStandingQuestionAction}>
                  <input type="hidden" name="question" value={s} />
                  <SubmitButton className="pill" pendingLabel="Answering…">
                    {s}
                  </SubmitButton>
                </form>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
