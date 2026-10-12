"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { addRivalAction, createBrandAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

/** Shown while the site is read and the rivals named: it takes half a minute. */
function Reading() {
  const { pending, data } = useFormStatus();
  if (!pending) return null;
  const site = String(data?.get("url") ?? "").replace(/^https?:\/\//, "");
  return (
    <div className="panel relative overflow-hidden mt-5 p-5">
      <div className="scanline" aria-hidden />
      <div className="flex items-center gap-2 label">
        <i className="dot dot-rec" /> Reading {site || "your site"}
      </div>
      <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-2 text-[14px] text-ink-2">
        <li>Working out what you sell, and to whom…</li>
        <li>Naming the brands fighting you for the same customer…</li>
      </ul>
    </div>
  );
}

export function UrlForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createBrandAction, {});
  return (
    <form action={action}>
      <div className="urlbox">
        <span className="prefix hidden sm:flex">https://</span>
        <input name="url" defaultValue={defaultUrl?.replace(/^https?:\/\//, "")} placeholder="yourbrand.com" aria-label="Your website" required />
        <SubmitButton pending="Reading…">Find my rivals →</SubmitButton>
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
        <input className="input flex-1" name="name" placeholder="Rival's name, as on Facebook" required />
        <input className="input sm:w-[200px]" name="website" placeholder="rival.com (optional)" />
        <SubmitButton className="btn btn-ghost" pending="Adding…">
          + Add rival
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
    </form>
  );
}
