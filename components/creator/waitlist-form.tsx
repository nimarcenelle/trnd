"use client";

import { useActionState } from "react";

import SubmitButton from "@/components/app/submit-button";
import { IconCheck } from "@/components/icons";
import { saveLeadAction, type LeadState } from "@/lib/creator/actions";

/** The plan's early-access list. Asks for the handle only when the visitor didn't come from a check. */
export default function WaitlistForm({ handle, platform, src }: { handle: string; platform: string; src: string }) {
  const [state, action] = useActionState<LeadState, FormData>(saveLeadAction, {});
  if (state.saved) {
    return (
      <div className="well px-4 py-3 text-[14.5px] flex items-center gap-2.5">
        <IconCheck className="text-brand shrink-0" />
        You&apos;re on the list. Your first weekly re-check arrives in seven days.
      </div>
    );
  }
  return (
    <form action={action} className="card p-5 flex flex-col gap-3">
      <input type="hidden" name="plan" value="1" />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="src" value={src} />
      {handle ? (
        <input type="hidden" name="handle" value={handle} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Your handle</span>
          <input name="handle" className="input" placeholder="@yourhandle" required autoComplete="off" />
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Email</span>
        <input name="email" type="email" className="input" placeholder="you@example.com" required autoComplete="email" />
      </label>
      <SubmitButton className="btn btn-primary btn-lg" pending="Saving…">
        Get early access
      </SubmitButton>
      {state.error && <p className="form-error mb-0">{state.error}</p>}
    </form>
  );
}
