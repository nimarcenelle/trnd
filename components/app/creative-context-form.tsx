"use client";

import { useActionState } from "react";

import type { Business, Service } from "@/lib/db/types";
import { FORMAT_OPTIONS, NOTES_MAX, OBJECTIVE_OPTIONS } from "@/lib/onboarding/context";
import { updateCreativeContextAction, type SettingsState } from "@/lib/settings/actions";

/**
 * The context every brief reads: what the campaign buys, what the brand can
 * make, which product leads, what it shot last, what it may claim. The
 * same fields onboarding asks for, editable any time.
 */
export default function CreativeContextForm({ business, services }: { business: Business; services: Service[] }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateCreativeContextAction, {});
  const formats = new Set(business.production_formats ?? []);
  const briefFor = new Set(business.brief_service_ids ?? []);
  const active = services.filter((s) => s.is_active !== false);
  return (
    <form action={formAction}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="cc-objective">What your campaigns optimize for</label>
          <select id="cc-objective" name="campaign_objective" defaultValue={business.campaign_objective ?? ""}>
            <option value="">Not set</option>
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cc-priority">Product or offer to lead with</label>
          <select id="cc-priority" name="priority_service_id" defaultValue={business.priority_service_id ?? ""}>
            <option value="">Let each brief choose</option>
            {services
              .filter((s) => s.is_active !== false)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {active.length > 1 && (
        <div className="field">
          <label>Products to brief for</label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Products to brief for">
            {active.map((s) => (
              <label key={s.id} className={`cb__refine-opt${briefFor.size === 0 || briefFor.has(s.id) ? " is-on" : ""}`}>
                <input type="checkbox" name="brief_service_ids" value={s.id} defaultChecked={briefFor.size === 0 || briefFor.has(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
          <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0">Every ticked product gets its own concepts, up to three each. Untick what you are not advertising.</p>
        </div>
      )}
      <div className="field">
        <label>What you can produce</label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What you can produce">
          {FORMAT_OPTIONS.map((f) => (
            <label key={f.value} className={`cb__refine-opt${formats.has(f.value) ? " is-on" : ""}`}>
              <input type="checkbox" name="production_formats" value={f.value} defaultChecked={formats.has(f.value)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="cc-recent">What you shot recently</label>
        <textarea
          id="cc-recent"
          name="recent_creative_notes"
          rows={3}
          maxLength={NOTES_MAX}
          defaultValue={business.recent_creative_notes ?? ""}
          placeholder="e.g. Three founder talking-heads on the serum, one unboxing, a static on the bundle. Links are fine."
        />
      </div>
      <div className="field">
        <label htmlFor="cc-claims">What you may and may not claim</label>
        <textarea
          id="cc-claims"
          name="claims_notes"
          rows={3}
          maxLength={NOTES_MAX}
          defaultValue={business.claims_notes ?? ""}
          placeholder='e.g. "Dermatologist tested" is fine. Never say "cures" or name a condition. No before-and-after photos.'
        />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="text-[13px] text-(--mint-text) m-0 mb-3">Saved. The next brief reads it.</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save context"}
      </button>
    </form>
  );
}
