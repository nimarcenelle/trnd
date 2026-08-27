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
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px" }}>
        Signed in as <b>{email}</b>
      </p>

      <form action={pwAction} style={{ maxWidth: 520 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
          <input name="current_password" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" required style={inputStyle} />
          <input name="new_password" type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" required minLength={8} style={inputStyle} />
          <input name="confirm_password" type="password" placeholder="Confirm new" aria-label="Confirm new password" autoComplete="new-password" required minLength={8} style={inputStyle} />
        </div>
        {pwState.error && <p className="form-error">{pwState.error}</p>}
        {pwState.notice && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mint)", margin: "0 0 12px" }}>
            {pwState.notice}
          </p>
        )}
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pwPending}>
          {pwPending ? "Updating…" : "Change password"}
        </button>
      </form>

      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "0 0 12px", lineHeight: 1.55, maxWidth: 560 }}>
          Deleting your account removes your business, services, campaigns, and recorded results
          permanently. Shared market signal is not affected.
        </p>
        {!confirmOpen ? (
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => setConfirmOpen(true)}>
            Delete account…
          </button>
        ) : (
          <form action={delAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
