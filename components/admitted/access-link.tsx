"use client";

import { useState } from "react";

/** The buyer's only way back in on another device, so it is one click to copy and shown once on arrival. */
export default function AccessLink({ url, welcome }: { url: string; welcome: boolean }) {
  const [open, setOpen] = useState(welcome);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button className="btn btn-ghost btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Account
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,calc(100vw-32px))] p-4 shadow-[var(--shadow-lg)]">
          <p className="text-[14px] font-semibold">{welcome ? "You are subscribed. Save your link." : "Your access link"}</p>
          <p className="text-[13px] text-ink-2 leading-[1.55] mt-1">There is no account. This link gets you back in on any device, and anyone who has it can use your access.</p>
          <form action="/api/essays/portal" method="post" className="mt-2">
            <button type="submit" className="text-[13px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]">
              Manage or cancel your subscription
            </button>
          </form>
          <div className="flex gap-2 mt-3">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
