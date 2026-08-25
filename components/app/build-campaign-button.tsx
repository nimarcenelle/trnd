"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BuildEvent } from "@/app/api/campaigns/build/route";

/**
 * The one primary action, with the generation narrated live on the button
 * itself — "Finding the angle…", "Writing headlines…" — instead of a frozen
 * label for a minute.
 */
export default function BuildCampaignButton({
  opportunityId,
  className = "btn btn-primary",
  children = "Build the campaign",
}: {
  opportunityId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setStatus("Starting…");
    setError(null);
    try {
      const res = await fetch("/api/campaigns/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const event = JSON.parse(l) as BuildEvent;
          if (event.type === "status") {
            setStatus(event.label);
          } else if (event.type === "done") {
            setStatus("Opening it…");
            router.push(`/app/campaigns/${event.campaignId}`);
            return;
          } else {
            setError(event.reason);
            setStatus(null);
            return;
          }
        }
      }
      setError("Lost the connection — try again.");
      setStatus(null);
    } catch {
      setError("The build hit a snag — try again in a moment.");
      setStatus(null);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button type="button" className={className} onClick={build} disabled={status !== null} aria-busy={status !== null}>
        {status ?? children}
      </button>
      {error && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--red)" }}>{error}</span>
      )}
    </span>
  );
}