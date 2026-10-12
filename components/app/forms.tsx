"use client";

import { useActionState } from "react";

import { addRivalAction, createBrandAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

export function UrlForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createBrandAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input className="input flex-1" name="url" defaultValue={defaultUrl} placeholder="yourbrand.com" aria-label="Your website" required />
        <SubmitButton pending="Reading your site…">Find my rivals</SubmitButton>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <p className="mono-label m-0">Takes about 30 seconds</p>
    </form>
  );
}

export function AddRivalForm() {
  const [state, action] = useActionState<FormState, FormData>(addRivalAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input className="input flex-1" name="name" placeholder="Rival name, as on Facebook" required />
        <input className="input sm:w-[200px]" name="website" placeholder="rival.com (optional)" />
        <SubmitButton className="btn btn-ghost" pending="Adding…">
          Add rival
        </SubmitButton>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}
