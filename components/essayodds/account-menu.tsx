"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  /** The signed-in account, or null. */
  email: string | null;
  /** When the pass on this request ends, or null for none. */
  until: string | null;
  hasPass: boolean;
  /** The checkout email of a pass held by this browser without an account, to offer signing in with it. */
  buyerEmail: string | null;
  welcome: boolean;
};

/** Signed in: who, what pass, log out. Signed out: log in, with a nudge to keep a pass bought without an account. */
export default function AccountMenu({ email, until, hasPass, buyerEmail, welcome }: Props) {
  const [open, setOpen] = useState(welcome);
  if (!email && !hasPass)
    return (
      <Link href="/login?next=/essay" className="btn btn-ghost btn-sm">
        Log in
      </Link>
    );
  return (
    <div className="relative">
      <button className="btn btn-ghost btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {email ? "Account" : "Log in"}
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,calc(100vw-32px))] p-4 shadow-[var(--shadow-lg)]">
          {email ? (
            <>
              <p className="text-[13px] text-ink-3">Signed in as</p>
              <p className="text-[14px] font-semibold break-all">{email}</p>
              <p className="text-[13px] text-ink-2 mt-3">{hasPass ? (until ? `Your pass runs until ${until}.` : "Your plan is active.") : "No pass on this account yet."}</p>
              {!hasPass && (
                <Link className="btn btn-primary btn-sm mt-3" href="/pricing">
                  See passes
                </Link>
              )}
              <form action="/api/account/logout" method="post" className="mt-4 border-t border-line pt-3">
                <button type="submit" className="text-[13px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold">{welcome ? "You're in. Now save your work." : "Save your work to an account"}</p>
              <p className="text-[13px] text-ink-2 leading-[1.55] mt-1">
                {until ? `Your pass runs until ${until}. ` : ""}Log in{buyerEmail ? ` with ${buyerEmail}` : " with the email you paid with"} and your pass and drafts follow you to any device.
              </p>
              <Link className="btn btn-primary btn-sm mt-3" href={`/login?next=/essay${buyerEmail ? `&email=${encodeURIComponent(buyerEmail)}` : ""}`}>
                Log in
              </Link>
              <button className="btn btn-ghost btn-sm mt-3 ml-1" type="button" onClick={() => setOpen(false)}>
                Later
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
