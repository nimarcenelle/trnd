"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Upload a document or paste text. Posts to /api/documents (a route
 * handler, so a real PDF fits), narrates the read, and refreshes the list.
 */
export default function DocumentUpload({ modelReady }: { modelReady: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    setStatus(modelReady ? "Reading it…" : "Adding it…");
    try {
      const res = await fetch("/api/documents", { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as { error?: string; facts?: number; services?: number };
      if (!res.ok) {
        setError(body.error ?? "That didn't go through — try again.");
        setStatus(null);
        return;
      }
      setStatus(
        `Added. ${body.facts ?? 0} fact${body.facts === 1 ? "" : "s"}${body.services ? `, ${body.services} priced item${body.services === 1 ? "" : "s"}` : ""}.`,
      );
      form.reset();
      router.refresh();
      setTimeout(() => setStatus(null), 4000);
    } catch {
      setError("Couldn't reach TRND — check your connection and try again.");
      setStatus(null);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="pill"
            onClick={() => setMode(m)}
            style={{ cursor: "pointer", background: mode === m ? "var(--amber-soft)" : "var(--bg-1)", color: mode === m ? "var(--amber-text)" : undefined }}
          >
            {m === "file" ? "Upload a file" : "Paste text"}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <input name="file" type="file" accept=".pdf,.csv,.txt,.md,.json,.tsv" aria-label="Document to upload" className="input" style={{ padding: "9px 12px" }} required />
      ) : (
        <>
          <input name="name" placeholder="Name, e.g. Fall menu" aria-label="Document name" maxLength={120} className="input" />
          <textarea name="text" placeholder="Paste a menu, price list, brand notes, or a sales summary" aria-label="Pasted text" rows={6} className="input" required />
        </>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={status !== null && !status.startsWith("Added")} aria-busy={status !== null}>
          {status && !status.startsWith("Added") ? status : "Add document"}
        </button>
        {status?.startsWith("Added") && <span className="mono-label" style={{ color: "var(--mint-text)" }}>{status}</span>}
        {error && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--red)" }}>{error}</span>}
      </div>
    </form>
  );
}
