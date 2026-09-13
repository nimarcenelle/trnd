"use client";

import { useActionState } from "react";

import { submitResultAction, type ResultFormState } from "@/lib/results/actions";

const FIELDS = [
  ["impressions", "Impressions", "12,400"],
  ["clicks", "Clicks", "310"],
  ["spend", "Spend $", "180"],
  ["bookings", "Bookings", "9"],
  ["revenue", "Revenue $", "1,240"],
] as const;

/** Five numbers from the ad account and one button. Blank fields are left out. */
export default function ResultEntryForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState<ResultFormState, FormData>(
    submitResultAction,
    {},
  );

  if (state.ok) {
    return <p className="mono-label m-0 text-(--mint-text)">Recorded. It feeds next week&apos;s scoring.</p>;
  }

  return (
    <form className="flex flex-wrap gap-[10px] items-end" action={formAction}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      {FIELDS.map(([name, label, ph]) => (
        <label className="flex flex-col gap-[6px] min-w-0" key={name}>
          <span className="mono-label">{label}</span>
          <input className="input w-[112px]" name={name} inputMode="decimal" placeholder={ph} />
        </label>
      ))}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Record results"}
      </button>
      {state.error && <span className="form-error m-0">{state.error}</span>}
    </form>
  );
}
