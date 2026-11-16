"use client";

import { useState } from "react";

/** Email, then the 6-digit code sent to it. No passwords. */
export default function LoginForm({ email: initial, next }: { email: string; next: string }) {
  const [email, setEmail] = useState(initial);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: string, body: object) {
    setBusy(true);
    setError("");
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    return res;
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const res = await post("/api/account/code", { email });
    if (res?.ok) return setStep("code");
    setError(res?.status === 429 ? "Too many codes today. Try again tomorrow, or write to hello@usetrnd.com." : res?.status === 400 ? "That doesn't look like an email address." : "That didn't go through. Try again in a minute.");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const res = await post("/api/account/verify", { email, code });
    if (res?.ok) {
      window.location.href = next;
      return;
    }
    setError(res?.status === 429 ? "Too many tries. Request a new code later." : "That code isn't right or has expired. Check the newest email, or send a new code.");
  }

  return step === "email" ? (
    <form onSubmit={sendCode} className="flex flex-col gap-3">
      <label className="text-[13px] font-medium" htmlFor="login-email">
        Email
      </label>
      <input id="login-email" className="input !h-12" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="btn btn-primary btn-lg !h-12" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      {error && <p className="text-[13px] text-neg">{error}</p>}
      <p className="caption">Use the email you paid with, and your pass comes with you.</p>
    </form>
  ) : (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <label className="text-[13px] font-medium" htmlFor="login-code">
        We sent a 6-digit code to {email}
      </label>
      <input
        id="login-code"
        className="input !h-14 text-[28px] tracking-[0.4em] text-center tnum"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
      />
      <button className="btn btn-primary btn-lg !h-12" type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Log in"}
      </button>
      {error && <p className="text-[13px] text-neg">{error}</p>}
      <div className="flex justify-between text-[13px] text-ink-2">
        <button type="button" className="underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]" onClick={() => setStep("email")}>
          Use a different email
        </button>
        <button type="button" className="underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]" disabled={busy} onClick={(e) => void sendCode(e as unknown as React.FormEvent)}>
          Send a new code
        </button>
      </div>
    </form>
  );
}
