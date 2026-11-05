"use client";

import { useState, type FormEvent } from "react";

/** Asks for a school we don't cover yet, and an email to tell them when it opens. */
export default function RequestSchool() {
  const [state, setState] = useState<"" | "busy" | "done" | "error">("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("busy");
    const res = await fetch("/api/school-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ school: form.get("school"), email: form.get("email") }) }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }

  if (state === "done") return <p className="text-[14px] text-brand font-medium mt-4">Got it. We will email you when it opens.</p>;
  return (
    <form className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center" onSubmit={(e) => void submit(e)}>
      <span className="text-[14px] font-medium shrink-0 sm:mr-2">Request a school</span>
      <input className="input sm:max-w-[240px]" name="school" placeholder="School name" aria-label="School name" required />
      <input className="input sm:max-w-[240px]" name="email" type="email" placeholder="Email" aria-label="Email" required />
      <button className="btn btn-secondary shrink-0" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Request"}
      </button>
      {state === "error" && <span className="text-[13px] text-neg">That did not go through. Try again.</span>}
    </form>
  );
}
