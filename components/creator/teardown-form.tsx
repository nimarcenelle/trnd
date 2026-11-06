"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import SubmitButton from "@/components/app/submit-button";
import { teardownAction, type TeardownState } from "@/lib/creator/actions";

function Working() {
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
  const handle = String(data?.get("handle") ?? "").replace(/^@/, "");
  return (
    <p className="caption mt-3 flex items-center gap-2">
      <span className="spinner" /> {seconds < 40 ? `Reading @${handle}'s last 12 posts` : "Writing the script"} · {seconds}s. Usually one to two minutes.
    </p>
  );
}

/** A public creator's handle in, a teardown script out. */
export default function TeardownForm() {
  const [state, action] = useActionState<TeardownState, FormData>(teardownAction, {});
  return (
    <form action={action}>
      <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <select name="platform" className="input" aria-label="Platform" defaultValue="tiktok">
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
        </select>
        <input name="handle" className="input" placeholder="@creator" aria-label="Creator handle" required autoComplete="off" />
        <input name="niche" className="input" placeholder="Niche, e.g. home workouts" aria-label="Niche" maxLength={80} />
        <SubmitButton pending="Working…">Make teardown</SubmitButton>
      </div>
      {state.error && <p className="form-error mt-3 mb-0">{state.error}</p>}
      <Working />
    </form>
  );
}
