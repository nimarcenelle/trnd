"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { SnapshotEvent, SnapshotFinding } from "@/lib/preview/types";

/**
 * The box that turns a website address into a demand snapshot.
 *
 * The wait is the point: findings stream in as the pipeline produces them,
 * so the ninety seconds an owner spends here is ninety seconds of reading
 * things about their own business they didn't expect a stranger to know —
 * not a progress bar. When the build lands, the page it navigates to is the
 * same evidence, permanent and shareable.
 */
export default function SnapshotForm({
  initialUrl = "",
  autoStart = false,
}: {
  initialUrl?: string;
  autoStart?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [findings, setFindings] = useState<SnapshotFinding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run(target: string) {
    if (!target.trim() || running) return;
    setRunning(true);
    setError(null);
    setFindings([]);
    setStatus("Looking up your site…");
    try {
      const res = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let landed = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw) as SnapshotEvent;
          if (event.type === "status") {
            setStatus(event.label);
          } else if (event.type === "finding") {
            setFindings((all) => [...all, event.finding]);
          } else if (event.type === "done") {
            landed = true;
            router.push(`/snapshot/${event.token}`);
          } else {
            landed = true;
            setError(event.reason);
          }
        }
      }
      if (!landed) setError("Lost the connection while reading that site. Try again.");
    } catch {
      setError("Something broke while reading that site. Try again in a minute.");
    } finally {
      setRunning(false);
      setStatus(null);
    }
  }

  useEffect(() => {
    if (autoStart && initialUrl && !started.current) {
      started.current = true;
      void run(initialUrl);
    }
    // run/initialUrl are stable for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialUrl]);

  return (
    <div className="snap-form">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(url);
        }}
      >
        <div className="field">
          <label htmlFor="snap-url">Your website</label>
          <input
            id="snap-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="joesbarbershop.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            aria-describedby="snap-help"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={running || !url.trim()}>
          {running ? "Reading your site…" : "Show me what's moving"}
        </button>
      </form>
      <p className="context" id="snap-help">
        No signup, no card. We read your public site once and measure demand where you are.
      </p>

      {error && <p className="form-error">{error}</p>}

      {(running || findings.length > 0) && (
        <div className="snap-stream" role="status" aria-live="polite">
          {findings.map((f, i) => (
            <div className="snap-find" key={`${f.headline}-${i}`}>
              <span className="snap-find__mark" aria-hidden="true" />
              <div>
                <p className="snap-find__head">{f.headline}</p>
                {f.detail && <p className="snap-find__detail">{f.detail}</p>}
              </div>
            </div>
          ))}
          {running && status && <p className="snap-status">{status}</p>}
        </div>
      )}
    </div>
  );
}
