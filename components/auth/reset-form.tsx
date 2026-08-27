"use client";

import { useActionState } from "react";

import { completePasswordResetAction, type AccountFormState } from "@/lib/auth/account-actions";

export default function ResetForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    completePasswordResetAction,
    {},
  );
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="new_password">New password</label>
        <input id="new_password" name="new_password" type="password" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="field">
        <label htmlFor="confirm_password">Confirm new password</label>
        <input id="confirm_password" name="confirm_password" type="password" placeholder="Same again" autoComplete="new-password" required minLength={8} />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%", justifyContent: "center" }}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
