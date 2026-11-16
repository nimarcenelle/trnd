"use client";

import { readStore, storeKey } from "@/lib/essayodds/storage";
import { useEffect, useState } from "react";

import type { ListKind, ListReview } from "@/lib/essayodds/lists-core";

const STORE = storeKey("lists");
const PLACEHOLDER: Record<ListKind, string> = {
  activities: "Paste your activities, one per paragraph: position, organization and description.\n\nPresident, Robotics Club\nLed team meetings and helped with competitions.",
  honors: "Paste your honors, one per line, with the level if you have it.\n\nAIME Qualifier (National)\nAP Scholar with Distinction (National)",
};

const errorFor = (status?: number) => {
  if (status === 400) return "Paste at least one full entry, under 6,000 characters.";
  if (status === 402) return "plan";
  if (status === 429) return "That's today's limit for list reviews. It resets at midnight UTC.";
  return "That did not go through. Try again in a minute.";
};

function Bands({ grade }: { grade: number }) {
  return (
    <span className="flex items-center gap-1 shrink-0" role="img" aria-label={`${grade} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-1.5 w-4 rounded-full ${n <= grade ? "bg-locked" : "bg-muted"}`} />
      ))}
    </span>
  );
}

function Rewrite({ text, limit }: { text: string; limit: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="well p-3 mt-3">
      <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>Tighter, from your own facts</span>
        <span className="tnum">
          {text.length} / {limit} characters
        </span>
      </div>
      <p className="text-[14px] leading-[1.55] mt-1.5">{text}</p>
      <button className="btn btn-ghost btn-sm mt-2 -ml-2" type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Paste a Common App activity or honors list; every entry is graded and the weakest one comes first. */
export default function ListReviewer() {
  const [kind, setKind] = useState<ListKind>("activities");
  const [texts, setTexts] = useState<Record<ListKind, string>>({ activities: "", honors: "" });
  const [result, setResult] = useState<ListReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(readStore("lists") ?? "null") as Record<ListKind, string> | null;
      if (saved) setTexts({ activities: saved.activities ?? "", honors: saved.honors ?? "" });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(texts));
    } catch {}
  }, [texts]);

  const text = texts[kind];

  async function run() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/lists/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, text }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(errorFor(res?.status));
    setResult((await res.json()) as ListReview);
  }

  const shown = result && result.kind === kind ? result : null;
  const order = shown ? shown.entries.map((e, i) => ({ e, i })).sort((a, b) => (a.i === shown.weakest ? -1 : b.i === shown.weakest ? 1 : a.i - b.i)) : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 items-start">
      <div className="card p-5">
        <div className="flex gap-1 border-b border-line -mx-5 px-5 -mt-1" role="tablist">
          {(["activities", "honors"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-9 px-3 -mb-px cursor-pointer border-b-2 text-[13px] font-medium ${kind === k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {k === "activities" ? "Activities" : "Honors"}
            </button>
          ))}
        </div>
        <textarea
          className="input mt-4 w-full !h-[340px] !py-3 leading-[1.6] resize-y"
          value={text}
          onChange={(e) => setTexts((t) => ({ ...t, [kind]: e.target.value }))}
          placeholder={PLACEHOLDER[kind]}
          aria-label={kind === "activities" ? "Your activity list" : "Your honors list"}
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-[13px] text-ink-3 tnum">{text.length.toLocaleString()} characters</span>
          <button className="btn btn-primary" type="button" disabled={busy || text.trim().length < 20} onClick={() => void run()}>
            {busy ? "Reading…" : `Review my ${kind === "activities" ? "activities" : "honors"}`}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {error === "plan" ? (
          <div className="card p-5 mb-5">
            <p className="text-[14px] font-semibold">Activity and honors reviews come with a plan.</p>
            <p className="text-[13px] text-ink-2 mt-1">Every entry scored, the weakest named, and a tighter version that fits the field, plus every essay scored and fixed.</p>
            <a className="btn btn-primary mt-4" href="/pricing">
              See plans
            </a>
          </div>
        ) : (
          error && <p className="well px-3 py-2 mb-5 text-[13px] text-neg">{error}</p>
        )}
        {busy ? (
          <div className="flex flex-col gap-3 animate-pulse" role="status">
            <p className="text-[14px] text-ink-2">Reading every entry. This takes about 30 seconds.</p>
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-24 rounded-[12px] bg-muted" />
            ))}
          </div>
        ) : shown ? (
          <ol className="list-none p-0 m-0 flex flex-col gap-3">
            {order.map(({ e, i }) => (
              <li key={i} className={`card p-5 ${i === shown.weakest ? "border-line-strong shadow-[var(--shadow-lg)]" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">{e.name}</span>
                  <span className="text-[20px] font-semibold tnum">{e.score}</span>
                </div>
                {i === shown.weakest && <p className="badge badge-info mt-2">Doing the least work: fix this first</p>}
                <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
                  {e.grades.map((g) => (
                    <li key={g.label} className="flex items-center justify-between gap-4 text-[13px] text-ink-2">
                      {g.label}
                      <Bands grade={g.grade} />
                    </li>
                  ))}
                </ul>
                <p className="text-[14px] leading-[1.55] mt-3">{e.fix}</p>
                {e.rewrite && <Rewrite text={e.rewrite} limit={shown.limit} />}
              </li>
            ))}
          </ol>
        ) : (
          <div className="max-w-[420px]">
            <h2 className="text-[16px] font-semibold">What you will get</h2>
            <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">
              Every entry scored out of 100 on {kind === "activities" ? "impact, specificity and clarity" : "scope, selectivity and clarity"}, the one doing the least work named first, and a tighter version that fits the Common App field and keeps only your facts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
