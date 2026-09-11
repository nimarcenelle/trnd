"use client";

import { useActionState } from "react";

import { submitResultAction, type ResultFormState } from "@/lib/results/actions";

export default function ResultEntryForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState<ResultFormState, FormData>(
    submitResultAction,
    {},
  );

  if (state.ok) {
    return (
      <p className="font-mono text-[12px] text-mint m-0">
        Recorded ✓ — fed into next week&apos;s scoring.
      </p>
    );
  }

  return (
    <form className="flex flex-wrap gap-[10px] items-end" action={formAction}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      {(
        [
          ["impressions", "Impressions", "12,400"],
          ["clicks", "Clicks", "310"],
          ["spend", "Spend $", "180"],
          ["bookings", "Bookings", "9"],
          ["revenue", "Revenue $", "1,240"],
        ] as const
      ).map(([name, label, ph]) => (
        <label className="flex flex-col gap-[5px]" key={name}>
          <span className="mono-label">{label}</span>
          <input className="w-[110px] font-body text-[13.5px] bg-bg-2 border border-line-strong text-ink py-[9px] px-[11px] rounded-card-sm"
            name={name}
            inputMode="decimal"
            placeholder={ph}
           
          />
        </label>
      ))}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Record results"}
      </button>
      {state.error && <span className="form-error m-0">{state.error}</span>}
    </form>
  );
}
