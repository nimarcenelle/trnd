"use client";

import { useState } from "react";

/** One field: the email used at checkout. The answer is the same whether or not a purchase exists. */
export default function RecoverForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "error" | "limit">("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/access/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setState(res?.ok ? "sent" : res?.status === 429 ? "limit" : "error");
  }
  if (state === "sent")
    return (
      <div className="card p-5">
        <p className="text-[14px] font-semibold">Check your inbox.</p>
        <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">If {email} paid for Admitted, your access link is on its way. It can take a minute; check spam too. If a parent paid, it went to their email.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <input className="input flex-1 !h-12" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email used at checkout" aria-label="Email used at checkout" />
      <button className="btn btn-primary btn-lg !h-12" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Email my link"}
      </button>
      {state === "error" && <p className="text-[13px] text-neg sm:basis-full">That didn&apos;t go through. Try again in a minute.</p>}
      {state === "limit" && <p className="text-[13px] text-neg sm:basis-full">Too many tries today. Write to hello@usetrnd.com and we&apos;ll send it.</p>}
    </form>
  );
}
