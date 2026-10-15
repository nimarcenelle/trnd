"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { IconPlus } from "@/components/icons";
import { addRivalAction, createBrandAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

/** What the read is doing, by the second it usually reaches that part. One model call does all of it, so this is a clock, not a signal. */
const READ_STEPS: { at: number; label: (site: string) => string }[] = [
  { at: 0, label: (site) => `Reading ${site}` },
  { at: 6, label: () => "Working out what you sell, to whom, and at what price" },
  { at: 18, label: () => "Naming the brands competing for the same customers" },
  { at: 38, label: () => "Ranking them by how directly they compete" },
];

/** Shown while the site is read and the rivals named: about a minute, narrated so it reads as progress. */
function Reading() {
  const { pending, data } = useFormStatus();
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!pending) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (!pending) return null;
  const site = String(data?.get("url") ?? "").replace(/^https?:\/\//, "") || "your site";
  const current = READ_STEPS.filter((s) => s.at <= seconds).length - 1;
  return (
    <div className="card mt-4 p-4">
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13.5px]">
        {READ_STEPS.map((step, i) => (
          <li key={step.at} className={`flex items-center gap-2.5 ${i > current ? "text-ink-3" : ""}`}>
            {i < current ? (
              <span className="w-3.5 h-3.5 rounded-full bg-ink text-bg grid place-items-center text-[9px]">✓</span>
            ) : i === current ? (
              <span className="spinner" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-line-strong" />
            )}
            {step.label(site)}
          </li>
        ))}
      </ul>
      <p className="caption mt-3">About a minute. Then you confirm the list and the first read of their ads starts.</p>
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
