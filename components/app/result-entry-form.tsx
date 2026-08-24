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
      <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mint)", margin: 0 }}>
        Recorded ✓ — fed into next week&apos;s scoring.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
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
        <label key={name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="mono-label">{label}</span>
          <input
            name={name}
            inputMode="decimal"
            placeholder={ph}
            style={{
              width: 110,
              fontFamily: "var(--body)",
              fontSize: 13.5,
              background: "var(--bg-2)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink)",
              padding: "9px 11px",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </label>
      ))}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Record results"}
      </button>
      {state.error && <span className="form-error" style={{ margin: 0 }}>{state.error}</span>}
    </form>
  );
}
