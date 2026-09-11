"use client";

import { useActionState } from "react";

import { launchToMetaAction, type LaunchState } from "@/lib/intel/actions";

/**
 * Push the campaign into the connected Meta account — created PAUSED, so the
 * owner reviews in Ads Manager and flips it on. Results sync back daily.
 */
export default function LaunchToMetaButton({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState<LaunchState, FormData>(launchToMetaAction, {});
  if (state.ok) {
    return (
      <span className="badge badge--mint" style={{ alignSelf: "center" }}>
        <i />
        In your Meta account (paused) — flip it on in Ads Manager
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <form action={formAction}>
        <input type="hidden" name="campaign_id" value={campaignId} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
          {pending ? "Creating in your account…" : "Launch to Meta (paused)"}
        </button>
      </form>
      {state.error && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--red)" }}>{state.error}</span>
      )}
    </span>
  );
}
