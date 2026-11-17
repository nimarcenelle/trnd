"use client";

import { useState } from "react";

/** The Pro call request: who, when works, and what to cover. The team confirms by email. */
export default function CallForm({ email }: { email: string }) {
  const [f, setF] = useState({ name: "", email, phone: "", times: "", focus: "" });
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/pro/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  }
  if (state === "sent")
    return (
      <div className="well p-5">
        <p className="text-[15px] font-semibold">Request sent.</p>
        <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">We&apos;ll email {f.email} within a day to confirm a time. Check spam if you don&apos;t see it.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-[13px] font-medium">
          Your name
          <input className="input mt-1.5 w-full" required value={f.name} onChange={set("name")} autoComplete="name" />
        </label>
        <label className="text-[13px] font-medium">
          Email
          <input className="input mt-1.5 w-full" type="email" required value={f.email} onChange={set("email")} autoComplete="email" />
        </label>
      </div>
      <label className="text-[13px] font-medium">
        Times that work for you, with your time zone
        <textarea className="input mt-1.5 w-full !h-20 !py-2 font-normal" required value={f.times} onChange={set("times")} placeholder="Weekdays after 6pm ET, or Saturday morning" />
      </label>
      <label className="text-[13px] font-medium">
        What should we cover?
        <textarea className="input mt-1.5 w-full !h-24 !py-2 font-normal" value={f.focus} onChange={set("focus")} placeholder="My Why Yale essay, whether my list is too reach-heavy, my activities" />
      </label>
      <label className="text-[13px] font-medium">
        Phone, if you&apos;d rather we call <span className="text-ink-3 font-normal">(optional)</span>
        <input className="input mt-1.5 w-full" value={f.phone} onChange={set("phone")} autoComplete="tel" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary btn-lg" type="submit" disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Request my call"}
        </button>
        {state === "error" && <span className="text-[13px] text-neg">That didn&apos;t go through. Try again, or write to hello@usetrnd.com.</span>}
      </div>
    </form>
  );
}
