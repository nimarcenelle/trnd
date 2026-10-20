"use client";

import { useActionState } from "react";

import { addPeerAction, saveGoalsAction, saveHashtagsAction, startAction, welcomeModelsAction, type FormState } from "@/lib/actions";
import type { Goals } from "@/lib/db/types";
import { GOALS } from "@/lib/goals";

import SubmitButton from "./submit-button";

/** The handle box: "@", the handle, Analyze. */
export function HandleForm({ defaultHandle, cta = "Analyze" }: { defaultHandle?: string; cta?: string }) {
  const [state, action] = useActionState<FormState, FormData>(startAction, {});
  return (
    <form action={action}>
      <div className="handlebox">
        <span className="at">@</span>
        <input name="handle" size={1} defaultValue={defaultHandle} placeholder="yourhandle" aria-label="Your TikTok handle" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        <SubmitButton className="btn btn-primary" pending="Starting…">
          {cta}
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-2 ml-4">{state.error}</p>}
    </form>
  );
}

/** What the creator is posting for: every idea is judged against it. */
export function GoalsForm({ goals, next, cta = "Save" }: { goals: Goals | null; next?: string; cta?: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveGoalsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-[13px] font-semibold mb-2">Main goal</legend>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
          {GOALS.map((g) => (
            <label key={g.value} className="relative">
              <input type="radio" name="goal" value={g.value} defaultChecked={(goals?.goal ?? "followers") === g.value} className="peer sr-only" required />
              <span className="choice">
                <span className="block text-[14px] font-bold">{g.label}</span>
                <span className="block text-[12.5px] text-ink-2">{g.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-ink-2">Posts per week you can make</span>
          <input className="input" name="posts_per_week" defaultValue={goals?.posts_per_week ?? ""} placeholder="5" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-ink-2">Target</span>
          <input className="input" name="target" defaultValue={goals?.target ?? ""} placeholder="100K followers by Dec 31" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-ink-2">Also care about</span>
          <input className="input" name="notes" defaultValue={goals?.notes ?? ""} placeholder="Shop sign-ups, without feeling salesy" />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <SubmitButton className="btn btn-primary" pending="Saving…">
          {cta}
        </SubmitButton>
        {state.saved && <span className="text-[13px] text-pos">Saved. The next plan is written against it.</span>}
        {state.error && <span className="form-error !m-0">{state.error}</span>}
      </div>
    </form>
  );
}

export function AddPeerForm() {
  const [state, action] = useActionState<FormState, FormData>(addPeerAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0" name="handle" placeholder="@acreatoryouwatch" aria-label="A creator's TikTok handle" autoCapitalize="none" spellCheck={false} />
        <SubmitButton className="btn" pending="Adding…">
          Add
        </SubmitButton>
      </div>
      {state.error && <p className="form-error !m-0">{state.error}</p>}
      {state.notice && <p className="text-[13px] text-pos">{state.notice}</p>}
    </form>
  );
}

/** Welcome: up to three creators they want to be like. */
export function ModelsForm({ next, defaults }: { next: string; defaults: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(welcomeModelsAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            className="input"
            name="handles"
            defaultValue={defaults[i] ? `@${defaults[i]}` : ""}
            placeholder={["@acreatoryouwanttobe", "@another", "@one more"][i]}
            aria-label={`Creator ${i + 1} you want to be like`}
            autoCapitalize="none"
            spellCheck={false}
          />
        ))}
      </div>
      {state.error && <p className="form-error !m-0">{state.error}</p>}
      <SubmitButton className="btn btn-primary btn-lg self-start" pending="Saving…">
        Continue
      </SubmitButton>
    </form>
  );
}

export function HashtagsForm({ hashtags }: { hashtags: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveHashtagsAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0 mono !text-[13.5px]" name="hashtags" defaultValue={hashtags.map((t) => `#${t}`).join(" ")} aria-label="Niche hashtags" />
        <SubmitButton className="btn" pending="Saving…">
          Save
        </SubmitButton>
      </div>
      {state.error && <p className="form-error !m-0">{state.error}</p>}
      {state.saved && <p className="text-[13px] text-pos">Saved. Trends and creators ahead of you are read from these on the next scan.</p>}
    </form>
  );
}
