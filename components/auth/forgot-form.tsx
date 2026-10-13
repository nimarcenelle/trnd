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
          <input id="email" name="email" type="email" placeholder="you@yourbrand.com" autoComplete="email" required />
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        {state.notice && (
          <p className="text-[13.5px] text-pos mb-4">
            {state.notice}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending}>
          {pending ? "One moment…" : "Email me a reset link"}
        </button>
      </form>
      <p className="text-[13.5px] text-ink-2 mt-[22px] text-center">
        Remembered it? <Link className="text-ink font-medium hover:underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
