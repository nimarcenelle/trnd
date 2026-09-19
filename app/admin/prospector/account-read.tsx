"use client";

import { useState } from "react";

/**
 * The free account read: paste a prospect's site, get the teardown email
 * to send. The demo, the pitch and the lead magnet in one box.
 */
export function AccountRead({ T, inputStyle }: { T: Record<string, string>; inputStyle: React.CSSProperties }) {
  const [website, setWebsite] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ subject: string; body: string; brand: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (running || !website.trim()) return;
    setRunning(true);
    setResult(null);
    setStatus("Starting…");
    try {
      const res = await fetch("/api/admin/prospector/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { reason?: string } | null;
        throw new Error(data?.reason ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; label?: string; reason?: string; subject?: string; body?: string; brand?: string };
          if (event.type === "status") setStatus(event.label ?? null);
          else if (event.type === "done") {
            setResult({ subject: event.subject ?? "", body: event.body ?? "", brand: event.brand ?? "" });
            setStatus(`Read ${event.brand}. Edit, then paste into your mail.`);
          } else if (event.type === "error") throw new Error(event.reason ?? "The read failed.");
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "The read failed.");
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-6 py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, letterSpacing: "0.08em", marginBottom: 8 }}>FREE ACCOUNT READ · DTC</div>
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://brand.com"
          aria-label="Prospect website"
          style={{ ...inputStyle, flex: "1 1 320px", maxWidth: 520 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button type="button" onClick={() => void run()} disabled={running || !website.trim()} className="btn btn-primary btn-sm">
          {running ? "Reading…" : "Run the read"}
        </button>
        {status && (
          <span className={running ? "pulsing" : undefined} style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>
            {status}
          </span>
        )}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: T.dim, maxWidth: 720, lineHeight: 1.5 }}>
        Reads the site and catalog, writes the founding analysis, names the rivals and reads their live ads, then the strategist
        reads the dossier. Three to six minutes. It lands on a prospect brand you own that no cron touches, and it costs what a
        signup costs.
      </p>
      {result && (
        <div className="mt-4 flex flex-col gap-2" style={{ maxWidth: 820 }}>
          <input value={result.subject} onChange={(e) => setResult({ ...result, subject: e.target.value })} aria-label="Subject" style={inputStyle} />
          <textarea value={result.body} onChange={(e) => setResult({ ...result, body: e.target.value })} aria-label="Email body" rows={18} style={{ ...inputStyle, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5 }} />
          <div>
            <button type="button" onClick={() => void copy()} className="btn btn-ghost btn-sm">
              {copied ? "Copied" : "Copy subject and body"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
