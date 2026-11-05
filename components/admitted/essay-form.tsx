"use client";

import { useState } from "react";

import type { Review } from "@/lib/admitted/review-core";

type Rewrite = { rewrite: string; changes: string[]; kept: number; words: number; limit: number; before: number; after: number; check: string[] };

const errorFor = (status?: number) => {
  if (status === 400) return "Paste a draft between 50 and 1,000 words.";
  if (status === 402) return "Your access could not be confirmed. Open your access link and try again.";
  if (status === 429) return "We have reached today's limit. Try again tomorrow.";
  return "That did not go through. Try again in a minute.";
};

function ReviewCard({ review }: { review: Review }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="tnum">
          <span className="text-[40px] font-semibold">{review.score}</span>
          <span className="text-[14px] text-ink-3"> / 100</span>
        </div>
        <span className={`text-[13px] tnum ${review.words > review.limit ? "text-neg" : "text-ink-3"}`}>
          {review.words} / {review.limit} words
        </span>
      </div>
      <p className="text-[13px] text-ink-3 mt-1">Reviewed by AI against six criteria.</p>
      <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-2">
        {review.grades.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-ink-2">{g.label}</span>
            <span className="flex items-center gap-1" role="img" aria-label={`${g.grade} of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-1.5 w-5 rounded-full ${n <= g.grade ? "bg-locked" : "bg-muted"}`} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      {review.notes.length > 0 && (
        <>
          <h2 className="text-[14px] font-semibold mt-6">What to fix</h2>
          <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-4">
            {review.notes.map((n) => (
              <li key={n.quote} className="text-[14px] leading-[1.6]">
                <p className="well px-3 py-2 text-ink-2">{n.quote}</p>
                <p className="mt-2 text-ink-2">{n.problem}</p>
                <p className="mt-1 font-medium">{n.fix}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {review.keep.length > 0 && (
        <>
          <h2 className="text-[14px] font-semibold mt-6">What to keep</h2>
          <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-3">
            {review.keep.map((k) => (
              <li key={k.quote} className="text-[14px] leading-[1.6] border-l-2 border-brand pl-3">
                <p>{k.quote}</p>
                <p className="mt-1 text-[13px] text-ink-2">{k.why}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function EssayForm() {
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState("650");
  const [review, setReview] = useState<Review | null>(null);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<"" | "review" | "rewrite">("");
  const [error, setError] = useState("");

  // A review belongs to the exact text it read.
  function edited(set: (value: string) => void, value: string) {
    set(value);
    setReview(null);
    setRewrite(null);
    setRevision(0);
  }

  async function post(path: string, body: object, step: "review" | "rewrite"): Promise<Response | null> {
    setBusy(step);
    setError("");
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError(errorFor(res?.status));
      return null;
    }
    return res;
  }

  async function runReview() {
    const res = await post("/api/essays/review", { essay: draft, prompt, limit }, "review");
    if (res) setReview((await res.json()) as Review);
  }

  async function runRewrite(next: number) {
    const res = await post("/api/essays/rewrite", { draft, prompt, limit, revision: next }, "rewrite");
    if (!res) return;
    setRevision(next);
    setRewrite((await res.json()) as Rewrite);
  }

  return (
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:items-start">
      <form
        className="card p-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runReview();
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <label className="text-[13px] font-medium">
            Essay prompt
            <input className="input mt-1.5 w-full" value={prompt} onChange={(e) => edited(setPrompt, e.target.value)} placeholder="Common App personal statement" />
          </label>
          <label className="text-[13px] font-medium">
            Word limit
            <input className="input mt-1.5 w-full tnum" inputMode="numeric" value={limit} onChange={(e) => edited(setLimit, e.target.value)} />
          </label>
        </div>
        <label className="text-[13px] font-medium">
          Your draft
          <textarea className="input mt-1.5 w-full !h-72 !py-2 leading-[1.6]" value={draft} onChange={(e) => edited(setDraft, e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-lg" type="submit" disabled={Boolean(busy)}>
          {busy === "review" ? "Reading your draft…" : "Review my draft"}
        </button>
        {error && <p className="text-[13px] text-neg">{error}</p>}
      </form>
      {review && (
        <div className="flex flex-col gap-6 min-w-0">
          <div className="card p-5">
            <ReviewCard review={review} />
            {!rewrite && (
              <button className="btn btn-secondary mt-6" type="button" disabled={Boolean(busy)} onClick={() => void runRewrite(0)}>
                {busy === "rewrite" ? "Rewriting…" : "Rewrite from this review"}
              </button>
            )}
          </div>
          {rewrite && rewrite.after <= rewrite.before && (
            <div className="card p-5 text-[14px] leading-[1.6]">
              <p className="font-medium">This draft needs your details first.</p>
              <p className="mt-1 text-ink-2">We only use what is in your draft, and a rewrite of this one did not score higher than {rewrite.before}. Add what the fixes above ask for, then review it again.</p>
            </div>
          )}
          {rewrite && rewrite.after > rewrite.before && (
            <div className="card p-5">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-3 tnum">
                <span className="text-brand font-medium">
                  Score {rewrite.before} → {rewrite.after}
                </span>
                <span>
                  {rewrite.words} / {rewrite.limit} words
                </span>
                <span>{rewrite.kept}% of sentences yours</span>
                <span>Revision {revision}</span>
              </div>
              {rewrite.check.length > 0 && (
                <div className="well p-3 mt-4 text-[13px]">
                  <p className="font-medium text-neg">Not in your draft. Cut these unless they are true.</p>
                  <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-1.5 text-ink-2">
                    {rewrite.check.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[14px] leading-[1.7] mt-4 whitespace-pre-wrap">{rewrite.rewrite}</p>
              <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-1.5 text-[13px] text-ink-2">
                {rewrite.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button className="btn btn-secondary mt-4" type="button" disabled={Boolean(busy)} onClick={() => void runRewrite(revision + 1)}>
                {busy === "rewrite" ? "Rewriting…" : "Ask for another revision"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
