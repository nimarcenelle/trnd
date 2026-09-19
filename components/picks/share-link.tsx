"use client";

import { useActionState } from "react";

import DetailCopyButton from "@/components/picks/detail-copy-button";
import { sharePickAction, type ShareState } from "@/lib/picks/actions";

/**
 * A link to the brief that reads without an account, for the creator who
 * will never log in. Made once and kept on the pick; making it again
 * returns the same link, and "Stop sharing" retires it.
 */
export default function ShareLink({ pickId, url }: { pickId: string; url: string | null }) {
  const [state, formAction, pending] = useActionState<ShareState, FormData>(sharePickAction, { url });
  const link = state.url ?? null;
  return (
    <div className="pickd__share">
      {link ? (
        <>
          <input className="input pickd__share-url" value={link} readOnly aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
          <DetailCopyButton text={link} label="Copy link" copiedLabel="Copied" />
          <form action={formAction}>
            <input type="hidden" name="pickId" value={pickId} />
            <input type="hidden" name="stop" value="1" />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
              {pending ? "…" : "Stop sharing"}
            </button>
          </form>
        </>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="pickId" value={pickId} />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
            {pending ? "Making the link…" : "Share link"}
          </button>
        </form>
      )}
      {state.error && (
        <p className="picks-run__error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
