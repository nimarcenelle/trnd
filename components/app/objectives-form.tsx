"use client";

import { useActionState } from "react";

import { updateObjectivesAction, type FormState } from "@/lib/actions";
import type { Objectives } from "@/lib/db/types";
import { GOALS } from "@/lib/goals";

import SubmitButton from "./submit-button";


/** What the brand is trying to do right now: drives which competitor moves are worth copying. */
export default function ObjectivesForm({ objectives }: { objectives: Objectives | null }) {
  const [state, action] = useActionState<FormState & { saved?: boolean }, FormData>(updateObjectivesAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-[13px] font-medium mb-2">Main goal right now</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {GOALS.map((g) => (
            <label key={g.value} className="relative cursor-pointer">
              <input type="radio" name="goal" value={g.value} defaultChecked={objectives?.goal === g.value} className="peer sr-only" required />
              <span className="block h-full rounded-lg border border-line-strong px-3 py-2.5 transition-colors peer-checked:border-ink peer-checked:bg-subtle peer-checked:shadow-[0_0_0_1px_var(--ink)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-subtle">
                <span className="block text-[13px] font-semibold">{g.label}</span>
                <span className="block text-[12px] text-ink-3 mt-0.5">{g.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Monthly ad budget</span>
          <input className="input" name="monthly_budget" defaultValue={objectives?.monthly_budget ?? ""} placeholder="$15,000" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Target cost per sale</span>
          <input className="input" name="target_cost" defaultValue={objectives?.target_cost ?? ""} placeholder="$35 CPA" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Focus product or offer</span>
          <input className="input" name="focus" defaultValue={objectives?.focus ?? ""} placeholder="The refill subscription" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Anything else TRND should know</span>
        <textarea className="input !h-auto py-2 leading-[1.5] resize-y" rows={2} name="notes" defaultValue={objectives?.notes ?? ""} placeholder="We can't run discounts deeper than 15%. Holiday push starts Nov 15." />
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-primary" pending="Saving…">
          Save goals
        </SubmitButton>
        {state.saved && <span className="text-[13px] text-pos">Saved. Run a scan to get advice against them.</span>}
        {state.error && <span className="form-error !m-0">{state.error}</span>}
      </div>
    </form>
  );
}
