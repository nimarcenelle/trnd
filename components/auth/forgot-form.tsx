"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordResetAction, type AccountFormState } from "@/lib/auth/account-actions";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  return (
    <div>
      <form action={action}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" placeholder="jordan@yourbusiness.com" autoComplete="email" required />
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        {state.notice && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mint)", margin: "0 0 14px" }}>
            {state.notice}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%", justifyContent: "center" }}>
          {pending ? "One moment…" : "Email me a reset link"}
        </button>
      </form>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 22, textAlign: "center" }}>
        Remembered it? <Link href="/login" style={{ color: "var(--amber)" }}>Sign in</Link>
      </p>
    </div>
  );
}
