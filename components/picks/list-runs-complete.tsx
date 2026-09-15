"use client";

import { useActionState } from "react";

import { RUN_RESULT_FIELDS } from "@/lib/picks/list";
import { completePickRunAction, type CompleteRunState } from "@/lib/picks/run-actions";

/**
 * "Mark completed", opened into a small results form. Every number is
 * optional: an owner who only knows the spend can still close the run, and
 * one who has the whole Ads Manager row teaches the Brand signal with it.
 */
/** The owner's own verdict. The numbers decide when they exist; this decides
 * when they don't, and it is what the track record counts. */
const VERDICTS = [
  { value: "won", label: "Did better than its reference" },
  { value: "lost", label: "Did not" },
  { value: "", label: "Let the numbers say" },
] as const;

export default function ListRunsComplete({ runId }: { runId: string }) {
  const [state, formAction, pending] = useActionState<CompleteRunState, FormData>(completePickRunAction, {});
  const errorId = `run-${runId}-error`;
  return (
    <details className="picks-run__complete">
      <summary className="btn btn-ghost btn-sm">Mark completed</summary>
      <form action={formAction} className="picks-run__results" aria-describedby={state.error ? errorId : undefined}>
        <input type="hidden" name="run_id" value={runId} />
        <p className="picks-run__results-hint">What did it do? Leave blank what you don&apos;t know.</p>
        <fieldset className="picks-run__verdict">
          <legend className="picks-run__verdict-legend">Your call</legend>
          {VERDICTS.map((v) => (
            <label key={v.value} className="picks-run__verdict-option">
              <input type="radio" name="verdict" value={v.value} defaultChecked={v.value === ""} />
              <span>{v.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="picks-run__fields">
          {RUN_RESULT_FIELDS.map((f) => (
            <label key={f.name} className="picks-run__field">
              <span>{f.label}</span>
              <input
                className="input"
                name={f.name}
                type="number"
                inputMode={f.money ? "decimal" : "numeric"}
                min={0}
                step={f.money ? "0.01" : "1"}
              />
            </label>
          ))}
        </div>
        <label className="picks-run__field picks-run__field--wide">
          <span>What did it teach you? (optional)</span>
          <textarea className="input" name="learned" rows={2} maxLength={600} placeholder="e.g. The hook held; the offer at the close did not." />
        </label>
        {state.error && (
          <p id={errorId} className="picks-run__error" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save and complete"}
        </button>
      </form>
    </details>
  );
}
