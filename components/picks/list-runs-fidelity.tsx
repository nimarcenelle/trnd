"use client";

import { useActionState } from "react";

import { checkRunFidelityAction, type FidelityState } from "@/lib/picks/run-actions";

/**
 * "Check the ad against the brief": the owner pastes the finished ad's
 * words and the run keeps how closely they followed the hook, the opening,
 * the approved facts and the format. With an ad linked to the test, the
 * box can stay empty and the linked ad's copy is read instead.
 */
export default function ListRunsFidelity({ runId, hasLinkedCopy, current }: { runId: string; hasLinkedCopy: boolean; current: string | null }) {
  const [state, formAction, pending] = useActionState<FidelityState, FormData>(checkRunFidelityAction, {});
  const line = state.line ?? current;
  return (
    <details className="picks-run__fidelity">
      <summary className="btn btn-ghost btn-sm">{line ? "Check the ad again" : "Check the ad against the brief"}</summary>
      <form action={formAction} className="picks-run__results">
        <input type="hidden" name="run_id" value={runId} />
        <p className="picks-run__results-hint">
          Paste the finished ad&apos;s words: the script, the captions, the primary text.
          {hasLinkedCopy ? " Leave it empty to read the linked ad's copy." : ""} The check says whether it opened on the hook, followed the first
          three seconds, used only the approved facts and matched the format, so a lost test can say whether the idea or the shoot lost.
        </p>
        <label className="picks-run__field picks-run__field--wide">
          <span>The ad&apos;s words</span>
          <textarea className="input" name="ad_text" rows={5} maxLength={6000} placeholder="Hook line, then what is said and shown…" />
        </label>
        {state.error && (
          <p className="picks-run__error" role="alert">
            {state.error}
          </p>
        )}
        {state.line && <p className="picks-run__stats">{state.line}</p>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Checking…" : "Check"}
        </button>
      </form>
    </details>
  );
}
