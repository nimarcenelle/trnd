"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import DetailCopyButton from "@/components/picks/detail-copy-button";
import { dismissPickAction, runPickAction } from "@/lib/picks/actions";
import { DISMISS_REASONS, NOTE_MAX_LENGTH, type ActionMode } from "@/lib/picks/detail";

function PendingButton({
  children,
  pendingLabel,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // Only the tapped reason says it's working; the rest just go quiet.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" className={className} name={name} value={value} disabled={pending} aria-busy={mine}>
      {mine ? pendingLabel : children}
    </button>
  );
}

/** The sticky footer: Copy all · Export · We're running this · Not for us. */
export default function DetailActions({
  pickId,
  copyText,
  exportHref,
  mode,
}: {
  pickId: string;
  copyText: string;
  exportHref: string;
  mode: ActionMode;
}) {
  const [picking, setPicking] = useState(false);
  const open = mode === "open";

  return (
    <div className="pickd__footer" role="region" aria-label="Pick actions">
      {open && picking && (
        <form action={dismissPickAction} className="pickd__reasons" id="pickd-reasons">
          <input type="hidden" name="pickId" value={pickId} />
          <p className="pickd__reasons-h">Why not this one?</p>
          <label className="pickd__note">
            <span className="mono-label">Note (optional)</span>
            <textarea name="note" rows={2} maxLength={NOTE_MAX_LENGTH} />
          </label>
          <div className="pickd__reason-list">
            {DISMISS_REASONS.map((r) => (
              <PendingButton
                key={r.value}
                name="reason"
                value={r.value}
                className="btn btn-ghost btn-sm"
                pendingLabel="Saving…"
              >
                {r.label}
              </PendingButton>
            ))}
          </div>
        </form>
      )}
      <div className="pickd__bar">
        <DetailCopyButton text={copyText} label="Copy all" copiedLabel="Copied all" />
        <a className="btn btn-ghost btn-sm" href={exportHref} download>
          Export
        </a>
        {open && (
          <>
            <span className="pickd__bar-gap" aria-hidden="true" />
            <form action={runPickAction}>
              <input type="hidden" name="pickId" value={pickId} />
              <PendingButton className="btn btn-primary btn-sm" pendingLabel="Starting…">
                We&apos;re running this
              </PendingButton>
            </form>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-expanded={picking}
              aria-controls="pickd-reasons"
              onClick={() => setPicking((v) => !v)}
            >
              Not for us
            </button>
          </>
        )}
        {mode === "running" && (
          <>
            <span className="pickd__bar-gap" aria-hidden="true" />
            <Link href="/app/campaigns" className="pickd__status">
              Running · see Campaigns
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
