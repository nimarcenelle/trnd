"use client";

import { useActionState, useState } from "react";

import { refinePickAction } from "@/lib/picks/refine";
import { REFINEMENTS, type RefineState } from "@/lib/picks/refinements";

/**
 * Targeted refinement: one of five asks, a note when the ask needs one.
 * The concept, the facts and the evidence stay; the page reloads with the
 * rewritten brief and a line saying what was asked.
 */
export default function RefineForm({ pickId, modelReady }: { pickId: string; modelReady: boolean }) {
  const [state, formAction, pending] = useActionState<RefineState, FormData>(refinePickAction, {});
  const [kind, setKind] = useState<string>("hook");
  const needsNote = REFINEMENTS.find((r) => r.value === kind)?.needsNote ?? false;
  return (
    <form action={formAction} className="cb__refine">
      <input type="hidden" name="pickId" value={pickId} />
      <p className="pickd__reasons-h">What should change? The concept, the approved facts and the evidence stay as they are.</p>
      {!modelReady && (
        <p className="cb__label-note">The writing model is not configured here, so only the hook can be switched. The rest needs the model key.</p>
      )}
      <div className="pickd__reason-list" role="radiogroup" aria-label="What to change">
        {REFINEMENTS.map((r) => (
          <label key={r.value} className={`cb__refine-opt${kind === r.value ? " is-on" : ""}`}>
            <input type="radio" name="kind" value={r.value} checked={kind === r.value} onChange={() => setKind(r.value)} />
            {r.label}
          </label>
        ))}
      </div>
      {(needsNote || kind === "objection") && (
        <label className="pickd__note">
          <span className="mono-label">{kind === "footage" ? "What footage do you have?" : "Which objection?"}</span>
          <textarea name="note" rows={2} maxLength={500} required />
        </label>
      )}
      {state.error && (
        <p className="picks-run__error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="cb__label-note">Rewritten. The previous version is kept under the brief.</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
        {pending ? "Rewriting…" : "Rewrite the brief"}
      </button>
    </form>
  );
}
