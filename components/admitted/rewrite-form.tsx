"use client";

import { useState } from "react";

type Result = { rewrite: string; changes: string[]; kept: number; words: number };

export default function RewriteForm() {
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(nextRevision: number) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/essays/rewrite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft, prompt, revision: nextRevision }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(res?.status === 400 ? "Paste a draft between 50 and 1,000 words." : "That did not go through. Try again in a minute.");
      return;
    }
    setRevision(nextRevision);
    setResult((await res.json()) as Result);
  }

  return (
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
      <form
        className="card p-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(0);
        }}
      >
        <label className="text-[13px] font-medium">
          Essay prompt
          <input className="input mt-1.5 w-full" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Common App personal statement" />
        </label>
        <label className="text-[13px] font-medium">
          Your draft
          <textarea className="input mt-1.5 w-full !h-72 !py-2 leading-[1.6]" value={draft} onChange={(e) => setDraft(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? "Rewriting…" : "Rewrite from my draft"}
        </button>
        {error && <p className="text-[13px] text-neg">{error}</p>}
      </form>
      {result && (
        <div className="card p-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-3 tnum">
            <span>{result.words} / 650 words</span>
            <span>{result.kept}% of sentences yours</span>
            <span>Revision {revision}</span>
          </div>
          <p className="text-[14px] leading-[1.7] mt-4 whitespace-pre-wrap">{result.rewrite}</p>
          <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-1.5 text-[13px] text-ink-2">
            {result.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button className="btn btn-secondary mt-4" type="button" disabled={busy} onClick={() => void run(revision + 1)}>
            Ask for another revision
          </button>
        </div>
      )}
    </div>
  );
}
