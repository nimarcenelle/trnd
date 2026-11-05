"use client";

import { useEffect, useRef, useState } from "react";

import { segments } from "@/lib/admitted/highlight";
import type { Review } from "@/lib/admitted/review-core";

type Rewrite = { rewrite: string; changes: string[]; kept: number; words: number; limit: number; before: number; after: number; check: string[] };
type Busy = "" | "review" | "rewrite";

const STORE = "admitted-essay-draft";
const MIN_WORDS = 50;
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const CRITERIA = ["Only you could have written it", "Sounds like a person", "Shows how you think", "The opening holds attention", "Earns its length", "Answers the prompt"];

const errorFor = (status?: number) => {
  if (status === 400) return "Paste a draft between 50 and 1,000 words.";
  if (status === 402) return "Your access could not be confirmed. Open your access link and try again.";
  if (status === 429) return "You've reached today's limit. It resets at midnight UTC.";
  return "That did not go through. Try again in a minute.";
};

function Bands({ grade }: { grade: number }) {
  return (
    <span className="flex items-center gap-1 shrink-0" role="img" aria-label={`${grade} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-1.5 w-5 rounded-full ${n <= grade ? "bg-locked" : "bg-muted"}`} />
      ))}
    </span>
  );
}

function Empty() {
  return (
    <div className="max-w-[440px]">
      <h2 className="text-[16px] font-semibold">What you will get</h2>
      <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">A score out of 100, the lines costing you most marked in your draft, and what to do about each one.</p>
      <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3">
        {CRITERIA.map((label) => (
          <li key={label} className="flex items-center justify-between gap-4 text-[13px] text-ink-3">
            {label}
            <Bands grade={0} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Working({ step }: { step: "review" | "rewrite" }) {
  return (
    <div className="max-w-[440px]" role="status">
      <h2 className="text-[16px] font-semibold">{step === "review" ? "Reading your draft" : "Rewriting from your draft"}</h2>
      <p className="text-[14px] text-ink-2 mt-1.5">{step === "review" ? "This takes about 40 seconds." : "This takes 2 to 4 minutes. Keep this page open."}</p>
      <div className="mt-6 flex flex-col gap-3 animate-pulse">
        {CRITERIA.map((label) => (
          <div key={label} className="h-3 rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}

function ReviewPane({ review, active, onSelect, onNext }: { review: Review; active: string | null; onSelect: (id: string) => void; onNext: () => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="tnum">
          <span className="text-[40px] font-semibold leading-none">{review.score}</span>
          <span className="text-[14px] text-ink-3"> / 100</span>
        </div>
        <span className={`text-[13px] tnum ${review.words > review.limit ? "text-neg" : "text-ink-3"}`}>
          {review.words} / {review.limit} words
        </span>
      </div>
      <p className="text-[13px] text-ink-3 mt-2">Reviewed by AI against six criteria.</p>
      <ul className="list-none p-0 m-0 mt-5 flex flex-col gap-2.5">
        {review.grades.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-4 text-[13px] text-ink-2">
            {g.label}
            <Bands grade={g.grade} />
          </li>
        ))}
      </ul>
      {review.notes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[14px] font-semibold">What to fix</h2>
          <ol className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
            {review.notes.map((n, i) => {
              const id = `fix-${i}`;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    className={`w-full text-left rounded-[10px] border p-3.5 cursor-pointer transition-colors ${active === id ? "border-line-strong bg-subtle" : "border-line hover:bg-subtle"}`}
                  >
                    <span className="flex gap-3">
                      <span className="h-5 w-5 shrink-0 rounded-full bg-[var(--soft)] text-[var(--soft-ink)] text-[11px] font-semibold tnum flex items-center justify-center">{i + 1}</span>
                      <span className="min-w-0 text-[14px] leading-[1.55]">
                        <span className="block font-medium">{n.fix}</span>
                        <span className="block text-[13px] text-ink-2 mt-1">{n.problem}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {review.keep.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[14px] font-semibold">What to keep</h2>
          <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-3">
            {review.keep.map((k, i) => {
              const id = `keep-${i}`;
              return (
                <li key={id}>
                  <button type="button" onClick={() => onSelect(id)} className="w-full text-left cursor-pointer border-l-2 border-brand pl-3 text-[13px] leading-[1.55] text-ink-2 hover:text-ink">
                    {k.why}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <button className="btn btn-primary mt-8" type="button" onClick={onNext}>
        {review.notes.some((n) => n.ask.trim()) ? "Add your details and rewrite" : "Rewrite my draft"}
      </button>
    </div>
  );
}

function RewritePane({ rewrite, revision, busy, onRevise, onUse, onDetails }: { rewrite: Rewrite; revision: number; busy: boolean; onRevise: () => void; onUse: () => void; onDetails: (() => void) | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {rewrite.after === rewrite.before ? (
        <div className="tnum">
          <span className="text-[40px] font-semibold leading-none">{rewrite.after}</span>
          <span className="text-[14px] text-ink-3"> Score unchanged</span>
        </div>
      ) : (
        <div className="tnum">
          <span className="text-[14px] text-ink-3">Score </span>
          <span className="text-[14px] text-ink-3">{rewrite.before} → </span>
          <span className={`text-[40px] font-semibold leading-none ${rewrite.after > rewrite.before ? "text-brand" : ""}`}>{rewrite.after}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3 tnum mt-2">
        <span>
          {rewrite.words} / {rewrite.limit} words
        </span>
        <span>{rewrite.kept}% of sentences yours</span>
        <span>Revision {revision}</span>
      </div>
      {rewrite.check.length > 0 && (
        <div className="well p-3 mt-5 text-[13px]">
          <p className="font-medium text-neg">Not in your draft. Cut these unless they are true.</p>
          <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-1.5 text-ink-2">
            {rewrite.check.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[14px] leading-[1.7] mt-5 whitespace-pre-wrap">{rewrite.rewrite}</p>
      <div className="flex flex-wrap gap-2 mt-5">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={onUse}>
          Use as my draft
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(rewrite.rewrite).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onRevise}>
          Another revision
        </button>
        {onDetails && (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onDetails}>
            Add more details
          </button>
        )}
      </div>
      {rewrite.changes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[14px] font-semibold">What changed</h2>
          <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2 text-[13px] leading-[1.55] text-ink-2">
            {rewrite.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DetailsPane({ asks, answers, busy, onChange, onRewrite }: { asks: string[]; answers: Record<string, string>; busy: boolean; onChange: (ask: string, value: string) => void; onRewrite: () => void }) {
  const filled = asks.filter((ask) => answers[ask]?.trim()).length;
  return (
    <div>
      <h2 className="text-[16px] font-semibold">Add what only you know</h2>
      <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">A rewrite only uses what you give it, so these details are what make it better. Answer in your own words. Rough notes are fine.</p>
      <div className="mt-5 flex flex-col gap-4">
        {asks.map((ask) => (
          <label key={ask} className="block text-[14px] font-medium leading-[1.5]">
            {ask}
            <textarea className="input mt-1.5 w-full !h-20 !py-2 font-normal leading-[1.55]" value={answers[ask] ?? ""} onChange={(e) => onChange(ask, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button className="btn btn-primary" type="button" disabled={busy || !filled} onClick={onRewrite}>
          Rewrite with my details
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onRewrite}>
          Rewrite without them
        </button>
      </div>
    </div>
  );
}

export default function EssayWorkspace() {
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState("650");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"review" | "rewrite">("review");
  const [reading, setReading] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState<Busy>("");
  const [error, setError] = useState("");
  const results = useRef<HTMLDivElement>(null);

  const words = countWords(draft);
  const asks = [...new Set((review?.notes ?? []).map((n) => n.ask.trim()).filter(Boolean))];
  const maxWords = Number(limit) || 650;

  // A browser convenience: a reload should not cost a student their draft.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { draft?: string; prompt?: string; limit?: string; answers?: Record<string, string> } | null;
      if (saved?.draft) setDraft(saved.draft);
      if (saved?.prompt) setPrompt(saved.prompt);
      if (saved?.limit) setLimit(saved.limit);
      if (saved?.answers) setAnswers(saved.answers);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ draft, prompt, limit, answers }));
    } catch {}
  }, [draft, prompt, limit, answers]);

  // A review belongs to the exact text it read.
  function edited(set: (value: string) => void, value: string) {
    set(value);
    setReview(null);
    setRewrite(null);
    setRevision(0);
    setTab("review");
    setActive(null);
    setShowDetails(false);
  }

  async function post(path: string, body: object, step: "review" | "rewrite"): Promise<Response | null> {
    setBusy(step);
    setError("");
    if (window.matchMedia("(max-width: 1023px)").matches) results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError(errorFor(res?.status));
      return null;
    }
    return res;
  }

  async function runReview(text = draft) {
    const res = await post("/api/essays/review", { essay: text, prompt, limit }, "review");
    if (!res) return;
    setReview((await res.json()) as Review);
    setTab("review");
    setReading(true);
  }

  async function runRewrite(next: number) {
    setTab("rewrite");
    const sent = asks.map((ask) => ({ ask, answer: answers[ask] ?? "" })).filter((a) => a.answer.trim());
    const res = await post("/api/essays/rewrite", { draft, prompt, limit, revision: next, answers: sent }, "rewrite");
    if (!res) return;
    setRevision(next);
    setShowDetails(false);
    setRewrite((await res.json()) as Rewrite);
  }

  function select(id: string) {
    setActive(id);
    document.getElementById(`mark-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function useRewrite() {
    if (!rewrite) return;
    const text = rewrite.rewrite;
    edited(setDraft, text);
    setAnswers({});
    void runReview(text);
  }

  const marks = review ? [...review.notes.map((n, i) => ({ id: `fix-${i}`, quote: n.quote })), ...review.keep.map((k, i) => ({ id: `keep-${i}`, quote: k.quote }))] : [];
  const number = (id: string) => (id.startsWith("fix-") ? Number(id.slice(4)) + 1 : null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:h-[calc(100dvh-57px)]">
      <section className="flex flex-col min-h-[70dvh] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 px-5 sm:px-8 py-4 border-b border-line">
          <label className="text-[12px] text-ink-3">
            Essay prompt
            <input className="input mt-1 w-full" value={prompt} onChange={(e) => edited(setPrompt, e.target.value)} placeholder="Common App personal statement" />
          </label>
          <label className="text-[12px] text-ink-3">
            Word limit
            <input className="input mt-1 w-full tnum" inputMode="numeric" value={limit} onChange={(e) => edited(setLimit, e.target.value)} />
          </label>
        </div>

        {reading && review ? (
          <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
            <p className="max-w-[640px] mx-auto text-[16px] leading-[1.75] whitespace-pre-wrap">
              {segments(draft, marks).map((s, i) =>
                s.id ? (
                  <mark
                    key={i}
                    id={`mark-${s.id}`}
                    onClick={() => setActive(s.id)}
                    className={`cursor-pointer rounded-[3px] px-0.5 text-ink transition-colors ${s.id.startsWith("keep-") ? "bg-pos-bg" : "bg-[var(--soft)]"} ${active === s.id ? "ring-2 ring-line-strong" : ""}`}
                  >
                    {s.text}
                    {number(s.id) && <sup className="ml-0.5 text-[11px] font-semibold tnum text-[var(--soft-ink)]">{number(s.id)}</sup>}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </div>
        ) : (
          <textarea
            className="flex-1 min-h-[320px] w-full resize-none bg-transparent px-5 sm:px-8 py-6 text-[16px] leading-[1.75] text-ink outline-none placeholder:text-ink-3"
            value={draft}
            onChange={(e) => edited(setDraft, e.target.value)}
            placeholder="Paste your draft here."
            aria-label="Your draft"
          />
        )}

        <div className="flex items-center justify-between gap-3 px-5 sm:px-8 py-3 border-t border-line bg-ground">
          <span className={`text-[13px] tnum ${words > maxWords ? "text-neg" : "text-ink-3"}`}>
            {words} / {maxWords} words
          </span>
          {reading && review ? (
            <button className="btn btn-secondary" type="button" onClick={() => setReading(false)}>
              Edit draft
            </button>
          ) : review ? (
            <button className="btn btn-secondary" type="button" onClick={() => setReading(true)}>
              Show marked lines
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={Boolean(busy) || words < MIN_WORDS} onClick={() => void runReview()}>
              {busy === "review" ? "Reading…" : words < MIN_WORDS ? `${MIN_WORDS} words minimum` : "Review my draft"}
            </button>
          )}
        </div>
      </section>

      <aside ref={results} className="flex flex-col min-h-[50dvh] lg:min-h-0 bg-subtle scroll-mt-14">
        {review && (
          <div className="flex gap-1 px-5 sm:px-8 pt-3 border-b border-line" role="tablist">
            {(["review", "rewrite"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-9 px-3 -mb-px cursor-pointer border-b-2 text-[13px] font-medium ${tab === t ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
              >
                {t === "review" ? "Review" : "Rewrite"}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
          {error && <p className="well px-3 py-2 mb-5 text-[13px] text-neg">{error}</p>}
          {busy === "review" || (busy === "rewrite" && tab === "rewrite") ? (
            <Working step={busy as "review" | "rewrite"} />
          ) : !review ? (
            <Empty />
          ) : tab === "review" ? (
            <div className="fade-in">
              <ReviewPane review={review} active={active} onSelect={select} onNext={() => setTab("rewrite")} />
            </div>
          ) : rewrite && !showDetails ? (
            <div className="fade-in">
              <RewritePane key={revision} rewrite={rewrite} revision={revision} busy={Boolean(busy)} onRevise={() => void runRewrite(revision + 1)} onUse={useRewrite} onDetails={asks.length ? () => setShowDetails(true) : null} />
            </div>
          ) : asks.length ? (
            <DetailsPane asks={asks} answers={answers} busy={Boolean(busy)} onChange={(ask, value) => setAnswers((a) => ({ ...a, [ask]: value }))} onRewrite={() => void runRewrite(rewrite ? revision + 1 : 0)} />
          ) : (
            <div className="max-w-[440px]">
              <h2 className="text-[16px] font-semibold">Rewrite from this review</h2>
              <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">We keep your details, and any fact that was not in your draft gets flagged.</p>
              <button className="btn btn-primary mt-5" type="button" disabled={Boolean(busy)} onClick={() => void runRewrite(0)}>
                Rewrite my draft
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
