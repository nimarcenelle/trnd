"use client";

import { useActionState } from "react";

import SubmitButton from "@/components/app/submit-button";
import type { BusinessMember } from "@/lib/db/types";
import { inviteMemberAction, removeMemberAction, type TeamState } from "@/lib/team/actions";

/** The roster on Settings: who is in, who has not signed in yet, one invite box. */
export default function TeamPanel({ members, isOwner, ownerEmail }: { members: BusinessMember[]; isOwner: boolean; ownerEmail: string }) {
  const [state, formAction, pending] = useActionState<TeamState, FormData>(inviteMemberAction, {});
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        <li className="flex items-center gap-3 py-2 px-[14px] border border-line rounded-card-sm bg-bg-1">
          <span className="text-[14px] flex-1 min-w-0 truncate">{ownerEmail}</span>
          <span className="mono-label">Owner</span>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 px-[14px] border border-line rounded-card-sm bg-bg-1">
            <span className="text-[14px] flex-1 min-w-0 truncate">{m.email}</span>
            <span className="mono-label">{m.user_id ? "Member" : "Invited"}</span>
            {isOwner && (
              <form action={removeMemberAction}>
                <input type="hidden" name="member_id" value={m.id} />
                <SubmitButton className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px] text-red" pendingLabel="…">
                  Remove
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form action={formAction} className="flex gap-[10px] flex-wrap items-start">
          <input name="email" type="email" placeholder="teammate@brand.com" aria-label="Teammate email" className="input flex-[1_1_240px]" required />
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Inviting…" : "Invite"}
          </button>
          {state.error && (
            <p className="basis-full m-0 font-mono text-[12px] text-red" role="alert">
              {state.error}
            </p>
          )}
          {state.ok && <p className="basis-full m-0 font-mono text-[12px] text-(--mint-text)">{state.ok}</p>}
        </form>
      )}
    </div>
  );
}
