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
          <p className="font-mono text-[11px] text-mint mx-0 mt-0 mb-[14px]">
            {state.notice}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
          {pending ? "One moment…" : "Email me a reset link"}
        </button>
      </form>
      <p className="text-[13.5px] text-ink-soft mt-[22px] text-center">
        Remembered it? <Link className="text-amber" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
