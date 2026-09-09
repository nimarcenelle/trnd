"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { BuildEvent } from "@/app/api/campaigns/build/route";

const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60_000;

/**
 * The one primary action, with the generation narrated live on the button
 * itself — "Finding the angle…", "Writing headlines…" — instead of a frozen
 * label for a minute.
 *
 * The build runs server-side and survives whatever the browser does to this
 * component: a sessionStorage marker records the in-flight build, so if the
 * user navigates away and back (remount) or the tab sleeps and the stream
 * drops, the button resumes as "Still building…" and polls until the
 * campaign lands — instead of snapping back to an idle label mid-build.
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
  const alive = useRef(true);
  const polling = useRef(false);
  const storageKey = `trnd:building:${opportunityId}`;

  // sessionStorage can throw (private windows, blocked site data) — a build
  // without the marker just loses resumability, never the build itself.
  const markStarted = (at: number) => {
    try {
      sessionStorage.setItem(storageKey, String(at));
    } catch {
      /* resumability only */
    }
  };
  const markDone = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* resumability only */
    }
  };
  const startedAt = (): number | null => {
    try {
      const v = sessionStorage.getItem(storageKey);
      const n = v ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  /** Watch for the campaign to land, however long the stream survived. */
  async function pollUntilDone(startedAtMs: number) {
    if (polling.current) return;
    polling.current = true;
    try {
      for (;;) {
        // Unmounted: stop quietly — the marker stays, the next mount resumes.
        if (!alive.current) return;
        if (Date.now() - startedAtMs > GIVE_UP_MS) {
          markDone();
          setError("Taking longer than expected — check Campaigns in a minute, or try again.");
          setStatus(null);
          return;
        }
        try {
          const res = await fetch(
            `/api/campaigns/build?opportunity_id=${encodeURIComponent(opportunityId)}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const { campaignId } = (await res.json()) as { campaignId: string | null };
            if (campaignId) {
              markDone();
              if (alive.current) {
                setStatus("Opening it…");
                router.push(`/app/campaigns/${campaignId}`);
              }
              return;
            }
          }
        } catch {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } finally {
      polling.current = false;
    }
  }

  // A build started on a previous mount of this row? Pick it back up.
  useEffect(() => {
    alive.current = true;
    const at = startedAt();
    const timer =
      at !== null
        ? setTimeout(() => {
            setStatus("Still building…");
            void pollUntilDone(at);
          }, 0)
        : null;
    return () => {
      alive.current = false;
      if (timer !== null) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function build() {
    setStatus("Starting…");
    setError(null);
    const at = Date.now();
    markStarted(at);

    let res: Response;
    try {
      res = await fetch("/api/campaigns/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      });
    } catch {
      // The request never reached the server — nothing is building.
      markDone();
      setError("Couldn't reach TRND — check your connection and try again.");
      setStatus(null);
      return;
    }

    try {
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
            markDone();
            setStatus("Opening it…");
            router.push(`/app/campaigns/${event.campaignId}`);
            return;
          } else {
            markDone();
            // A stale opportunity id means the ranking was rebuilt behind
            // this page (e.g. the analysis just landed) — refresh so the
            // button binds to the current row.
            if (/isn't available/.test(event.reason)) {
              setError("The ranking just updated — try again.");
              router.refresh();
            } else {
              setError(event.reason);
            }
            setStatus(null);
            return;
          }
        }
      }
      // Stream ended without a verdict — the connection dropped, but the
      // build is still running server-side. Watch for it to land.
      setStatus("Still building…");
      void pollUntilDone(at);
    } catch {
      // Same story mid-stream (tab slept, network blipped): don't declare
      // failure while the server may be seconds from finishing.
      if (alive.current) setStatus("Still building…");
      void pollUntilDone(at);
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
