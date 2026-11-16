"use client";

import { useState } from "react";

/** A link shown in full with one button to copy it. */
export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input className="input flex-1 min-w-0 tnum text-[13px]" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Access link" />
      <button className="btn btn-primary" type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
