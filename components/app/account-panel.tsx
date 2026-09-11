"use client";

import { useActionState, useState } from "react";

import {
  changePasswordAction,
  deleteAccountAction,
  type AccountFormState,
} from "@/lib/auth/account-actions";

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--body)",
  fontSize: 14,
  background: "var(--bg-2)",
  border: "1px solid var(--line-strong)",
  color: "var(--ink)",
  padding: "11px 13px",
  borderRadius: "var(--radius-sm)",
};

export default function AccountPanel({ email }: { email: string }) {
  const [pwState, pwAction, pwPending] = useActionState<AccountFormState, FormData>(
    changePasswordAction,
    {},
  );
  const [delState, delAction, delPending] = useActionState<AccountFormState, FormData>(
    deleteAccountAction,
    {},
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div>
      <p className="text-[13.5px] text-ink-soft mx-0 mt-0 mb-[18px]">
        Signed in as <b>{email}</b>
      </p>

      <form className="max-w-[520px]" action={pwAction}>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-[10px] mb-3">
          <input name="current_password" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" required style={inputStyle} />
          <input name="new_password" type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" required minLength={8} style={inputStyle} />
          <input name="confirm_password" type="password" placeholder="Confirm new" aria-label="Confirm new password" autoComplete="new-password" required minLength={8} style={inputStyle} />
        </div>
        {pwState.error && <p className="form-error">{pwState.error}</p>}
        {pwState.notice && (
          <p className="font-mono text-[11px] text-mint mx-0 mt-0 mb-3">
            {pwState.notice}
          </p>
        )}
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pwPending}>
          {pwPending ? "Updating…" : "Change password"}
        </button>
      </form>

      <div className="mt-[26px] pt-[18px] border-t border-dashed border-line">
        <p className="text-[12.5px] text-ink-faint mx-0 mt-0 mb-3 leading-[1.55] max-w-[560px]">
          Deleting your account removes your business, services, campaigns, and recorded results
          permanently. Shared market signal is not affected.
        </p>
        {!confirmOpen ? (
          <button type="button" className="btn btn-ghost btn-sm text-red" onClick={() => setConfirmOpen(true)}>
            Delete account…
          </button>
        ) : (
          <form className="flex gap-[10px] flex-wrap items-center" action={delAction}>
            <input name="confirm" placeholder='Type DELETE to confirm' aria-label="Type DELETE to confirm" autoComplete="off" required style={{ ...inputStyle, width: 200 }} />
            <button type="submit" className="btn btn-sm" disabled={delPending} style={{ background: "var(--red)", color: "#fff", border: "1px solid var(--red)" }}>
              {delPending ? "Deleting…" : "Delete forever"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            {delState.error && <p className="form-error" style={{ margin: 0, flexBasis: "100%" }}>{delState.error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
