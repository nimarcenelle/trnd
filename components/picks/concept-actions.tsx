"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import DetailCopyButton from "@/components/picks/detail-copy-button";
import { choosePickAction, dismissPickAction, launchPickAction } from "@/lib/picks/actions";
import type { ConceptStatus } from "@/lib/picks/concept-view";
import { DISMISS_REASONS, NOTE_MAX_LENGTH } from "@/lib/picks/detail";

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
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" className={className} name={name} value={value} disabled={pending} aria-busy={mine}>
      {mine ? pendingLabel : children}
    </button>
  );
}

/**
 * The decisions on a creative test, in the sticky footer. What shows
 * depends on where the test is: a proposed concept can be chosen or passed;
 * a chosen one can be marked launched; a launched one takes results on
 * Campaigns. Copy and export are always there: the brief is the customer's.
 */
export default function ConceptActions({
  pickId,
  copyText,
  exportHref,
  status,
  refine,
  share,
}: {
  pickId: string;
  copyText: string;
  exportHref: string;
  status: ConceptStatus;
  /** The refinement form, rendered by the page; null when the pick can no longer change. */
  refine?: React.ReactNode;
  /** The share-link control, rendered by the page. */
  share?: React.ReactNode;
}) {
  const [passing, setPassing] = useState(false);
  const [refining, setRefining] = useState(false);

  return (
    <div className="pickd__footer" role="region" aria-label="Decisions on this test">
      {status === "proposed" && passing && (
        <form action={dismissPickAction} className="pickd__reasons" id="pickd-reasons">
          <input type="hidden" name="pickId" value={pickId} />
          <p className="pickd__reasons-h">Why pass? This is a decision, not a result; it keeps the concept out for a while, not the topic.</p>
          <label className="pickd__note">
            <span className="mono-label">Note (optional)</span>
            <textarea name="note" rows={2} maxLength={NOTE_MAX_LENGTH} />
          </label>
          <div className="pickd__reason-list">
            {DISMISS_REASONS.map((r) => (
              <PendingButton key={r.value} name="reason" value={r.value} className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                {r.label}
              </PendingButton>
            ))}
          </div>
        </form>
      )}
      {refine && refining && (
        <div className="pickd__reasons" id="pickd-refine">
          {refine}
        </div>
      )}
      <div className="pickd__bar">
        <DetailCopyButton text={copyText} label="Copy brief" copiedLabel="Copied" />
        <span className="pickd__exports" role="group" aria-label="Export the brief">
          <a className="btn btn-ghost btn-sm" href={exportHref} download>
            Export
          </a>
          <a className="btn btn-ghost btn-sm pickd__export-alt" href={`${exportHref}?format=md`} download title="Markdown, for Notion and Slack">
            .md
          </a>
          <a className="btn btn-ghost btn-sm pickd__export-alt" href={`${exportHref}?format=docx`} download title="Word, for the agency">
            .docx
          </a>
        </span>
        {share}
        {refine && (status === "proposed" || status === "chosen") && (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={refining} aria-controls="pickd-refine" onClick={() => setRefining((v) => !v)}>
            Refine
          </button>
        )}
        <span className="pickd__bar-gap" aria-hidden="true" />
        {status === "proposed" && (
          <>
            <form action={choosePickAction}>
              <input type="hidden" name="pickId" value={pickId} />
              <PendingButton className="btn btn-primary btn-sm" pendingLabel="Saving…">
                Choose for production
              </PendingButton>
            </form>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={passing} aria-controls="pickd-reasons" onClick={() => setPassing((v) => !v)}>
              Pass
            </button>
          </>
        )}
        {status === "chosen" && (
          <form action={launchPickAction}>
            <input type="hidden" name="pickId" value={pickId} />
            <PendingButton className="btn btn-primary btn-sm" pendingLabel="Saving…">
              Mark launched
            </PendingButton>
          </form>
        )}
        {status === "launched" && (
          <Link href="/app/campaigns" className="btn btn-primary btn-sm">
            Add results
          </Link>
        )}
        {status === "ended" && (
          <Link href="/app/campaigns" className="pickd__status">
            Ended · see Campaigns
          </Link>
        )}
      </div>
    </div>
  );
}
