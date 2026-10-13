"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { IconPlus } from "@/components/icons";
import { addRivalAction, createBrandAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

/** Shown while the site is read and the rivals named: about half a minute. */
function Reading() {
  const { pending, data } = useFormStatus();
  if (!pending) return null;
  const site = String(data?.get("url") ?? "").replace(/^https?:\/\//, "");
  return (
    <div className="card mt-4 p-4">
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13.5px]">
        <li className="flex items-center gap-2.5">
          <span className="spinner" /> Reading {site || "your site"}
        </li>
        <li className="flex items-center gap-2.5 text-ink-3">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-line-strong" /> Finding the brands competing for your customers
        </li>
      </ul>
    </div>
  );
}

export function UrlForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createBrandAction, {});
  return (
    <form action={action}>
      <div className="sitebox">
        <input name="url" defaultValue={defaultUrl?.replace(/^https?:\/\//, "")} placeholder="yourbrand.com" aria-label="Your website" required />
        <SubmitButton className="btn btn-primary" pending="Reading…">
          Continue
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-3">{state.error}</p>}
      <Reading />
    </form>
  );
}

export function AddRivalForm() {
  const [state, action] = useActionState<FormState, FormData>(addRivalAction, {});
  return (
    <form action={action}>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className="input flex-1" name="name" placeholder="Competitor name, as on Facebook" required />
        <input className="input sm:w-[200px]" name="website" placeholder="Website (optional)" />
        <SubmitButton className="btn btn-secondary" pending="Adding…">
          <IconPlus /> Add
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-2 mb-0">{state.error}</p>}
    </form>
  );
}
