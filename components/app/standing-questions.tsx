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
    <section className="panel mt-[18px]">
      <div className="panel__head">
        <span className="panel__title">Standing questions</span>
        <span className="panel__meta">Answered every Monday</span>
      </div>

      {questions.length === 0 && (
        <p className="mx-0 mt-0 mb-[14px] text-[13.5px] leading-[1.6] text-ink-soft max-w-[640px]">
          Questions TRND answers every Monday, with what changed since the last answer.
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
          <div className="flex justify-between gap-3 items-baseline flex-wrap">
            <span className="font-disp font-semibold text-[14.5px]">{q.question}</span>
            <span className="flex gap-3 items-baseline">
              <span className="mono-label">
                {q.answered_week ? `Answered for the week of ${fmtWeek(q.answered_week)}` : modelReady ? "First answer on Monday" : "Not answered yet"}
              </span>
              <form action={removeStandingQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="mono-label bg-transparent border-0 cursor-pointer text-ink-faint p-0">
                  Remove
                </button>
              </form>
            </span>
          </div>
          {q.changed && (
            <p className="mx-0 mt-2 mb-[6px] text-[13.5px] leading-[1.55] text-(--amber-text)">
              <span className="mono-label text-(--amber-text) mr-2">Since last week</span>
              {q.changed}
            </p>
          )}
          {q.answer.map((p) => (
            <p className="mx-0 mt-[6px] mb-0 text-[13.5px] leading-[1.6] text-ink-soft max-w-[680px]" key={p.slice(0, 40)}>
              {p}
            </p>
          ))}
        </div>
      ))}

      {room && (
        <div style={{ marginTop: questions.length > 0 ? 14 : 0, paddingTop: questions.length > 0 ? 14 : 0, borderTop: questions.length > 0 ? "1px dashed var(--line)" : "none" }}>
          <form className="flex gap-[10px] flex-wrap" action={addStandingQuestionAction}>
            <input
              name="question"
              placeholder="A question to answer every week"
              aria-label="New standing question"
              maxLength={240}
              className="input flex-[1_1_320px]"
             
            />
            <SubmitButton className="btn btn-ghost btn-sm" pendingLabel={modelReady ? "Answering…" : "Adding…"}>
              Add question
            </SubmitButton>
          </form>
          {suggestions.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
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
