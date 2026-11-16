"use client";

import { readStore, storeKey } from "@/lib/essayodds/storage";
import { useEffect, useState } from "react";

import { essayVerdict, listVerdict, MIN_WORDS, ready, type Verdict } from "@/lib/essayodds/final-core";
import type { ListKind, ListReview } from "@/lib/essayodds/lists-core";
import type { Review } from "@/lib/essayodds/review-core";

/** One essay to submit. Kept in this browser only, like the workspace draft. */
type Piece = { id: string; label: string; prompt: string; limit: number; text: string };
export type SchoolOption = { id: string; name: string; prompts: { title: string; text: string; limit: number | null; required: boolean }[] };

const STORE = storeKey("final");
const DRAFT_STORE = storeKey("essay-draft");
const LISTS_STORE = storeKey("lists");
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const newId = () => Math.random().toString(36).slice(2, 10);

const STATUS: Record<Verdict["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "badge badge-pos" },
  pass: { label: "One more pass", className: "badge badge-info" },
  over: { label: "Over the limit", className: "badge badge-neg" },
  empty: { label: "Not written", className: "badge badge-outline" },
};

async function post<T>(path: string, body: object): Promise<T | null> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/** Runs tasks two at a time, so a long list doesn't send every review at once. */
async function inPairs(tasks: (() => Promise<void>)[]) {
  const queue = [...tasks];
  await Promise.all([0, 1].map(async () => {
    while (queue.length) await queue.shift()!();
  }));
}

export default function FinalRead({ schools }: { schools: SchoolOption[] }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [lists, setLists] = useState<Record<ListKind, string>>({ activities: "", honors: "" });
  const [reviews, setReviews] = useState<Record<string, Review | null>>({});
  const [listReviews, setListReviews] = useState<Record<ListKind, ListReview | null>>({ activities: null, honors: null });
  const [failed, setFailed] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [school, setSchool] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(readStore("final") ?? "null") as Piece[] | null;
      if (saved?.length) setPieces(saved);
      const savedLists = JSON.parse(readStore("lists") ?? "null") as Record<ListKind, string> | null;
      if (savedLists) setLists({ activities: savedLists.activities ?? "", honors: savedLists.honors ?? "" });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(pieces));
    } catch {}
  }, [pieces]);

  function add(piece: Omit<Piece, "id">) {
    const id = newId();
    setPieces((p) => [...p, { ...piece, id }]);
    setOpen(id);
  }

  function addSchool() {
    const s = schools.find((x) => x.id === school);
    if (!s) return;
    const prompts = s.prompts.filter((p) => p.required);
    for (const p of prompts.length ? prompts : s.prompts.slice(0, 1)) add({ label: `${s.name}: ${p.title}`, prompt: p.text, limit: p.limit ?? 650, text: "" });
    setSchool("");
  }

  function addDraft() {
    try {
      const d = JSON.parse(readStore("essay-draft") ?? "null") as { draft?: string; prompt?: string; limit?: string } | null;
      add({ label: d?.prompt ? d.prompt.slice(0, 60) : "Personal statement", prompt: d?.prompt ?? "", limit: Number(d?.limit) || 650, text: d?.draft ?? "" });
    } catch {
      add({ label: "Personal statement", prompt: "", limit: 650, text: "" });
    }
  }

  function edit(id: string, patch: Partial<Piece>) {
    setPieces((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if ("text" in patch || "prompt" in patch || "limit" in patch) setReviews((r) => ({ ...r, [id]: null }));
  }

  async function run() {
    setRunning(true);
    setFailed([]);
    const misses: string[] = [];
    const tasks: (() => Promise<void>)[] = pieces
      .filter((p) => countWords(p.text) >= MIN_WORDS)
      .map((p) => async () => {
        const r = await post<Review>("/api/essays/review", { essay: p.text, prompt: p.prompt, limit: p.limit });
        if (!r) misses.push(p.label);
        setReviews((all) => ({ ...all, [p.id]: r }));
      });
    for (const kind of ["activities", "honors"] as const)
      if (lists[kind].trim().length >= 20)
        tasks.push(async () => {
          const r = await post<ListReview>("/api/lists/review", { kind, text: lists[kind] });
          if (!r) misses.push(kind === "activities" ? "Activities" : "Honors");
          setListReviews((all) => ({ ...all, [kind]: r }));
        });
    await inPairs(tasks);
    setFailed(misses);
    setRunning(false);
  }

  const rows = [
    ...pieces.map((p) => ({ key: p.id, label: p.label, verdict: essayVerdict(countWords(p.text), reviews[p.id] ?? null), piece: p })),
    ...(["activities", "honors"] as const).filter((k) => lists[k].trim()).map((k) => ({ key: k, label: k === "activities" ? "Activity list" : "Honors list", verdict: listVerdict(true, listReviews[k]), piece: null })),
  ];
  const checked = Object.values(reviews).some(Boolean) || Object.values(listReviews).some(Boolean);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12 items-start">
      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <div className="card p-6">
            <h2 className="text-[16px] font-semibold">Add what you are submitting</h2>
            <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">Pick a school to add its required prompts, or bring in the draft from your workspace. Your activity and honors lists come in from the Activities page.</p>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.key} className="card">
            <button type="button" className="w-full text-left p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(open === row.key ? null : row.key)} aria-expanded={open === row.key}>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium truncate">{row.label}</span>
                <span className="block text-[13px] text-ink-2 leading-[1.5] mt-1">{row.verdict.reason}</span>
              </span>
              <span className={`${STATUS[row.verdict.status].className} shrink-0`}>{STATUS[row.verdict.status].label}</span>
            </button>
            {open === row.key && row.piece && (
              <div className="border-t border-line p-4 flex flex-col gap-3">
                <label className="text-[12px] text-ink-3">
                  Name
                  <input className="input mt-1 w-full" value={row.piece.label} onChange={(e) => edit(row.key, { label: e.target.value })} />
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                  <label className="text-[12px] text-ink-3">
                    Prompt
                    <input className="input mt-1 w-full" value={row.piece.prompt} onChange={(e) => edit(row.key, { prompt: e.target.value })} placeholder="Common App personal statement" />
                  </label>
                  <label className="text-[12px] text-ink-3">
                    Word limit
                    <input className="input mt-1 w-full tnum" inputMode="numeric" value={row.piece.limit} onChange={(e) => edit(row.key, { limit: Number(e.target.value) || 650 })} />
                  </label>
                </div>
                <textarea className="input w-full !h-48 !py-2 leading-[1.6]" value={row.piece.text} onChange={(e) => edit(row.key, { text: e.target.value })} placeholder="Paste the final draft." aria-label="Final draft" />
                <div className="flex items-center justify-between text-[13px] text-ink-3 tnum">
                  <span className={countWords(row.piece.text) > row.piece.limit ? "text-neg" : ""}>
                    {countWords(row.piece.text)} / {row.piece.limit} words
                  </span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPieces((p) => p.filter((x) => x.id !== row.key))}>
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <select className="input flex-1 min-w-0" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="Add a school's prompts">
            <option value="">Add a school&apos;s prompts…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" type="button" disabled={!school} onClick={addSchool}>
            Add
          </button>
          <button className="btn btn-ghost" type="button" onClick={addDraft}>
            Bring in my draft
          </button>
        </div>
      </div>

      <aside className="card p-6 lg:sticky lg:top-20">
        <div className="tnum">
          <span className="text-[40px] font-semibold leading-none">{checked ? ready(rows.map((r) => r.verdict)) : "–"}</span>
          <span className="text-[14px] text-ink-3"> of {rows.length} ready</span>
        </div>
        <p className="text-[13px] text-ink-2 leading-[1.55] mt-3">An essay is ready at 75 or more and within its limit. A list is ready when every entry scores 60 or more. Unchanged drafts keep their saved review, so running it again is quick.</p>
        <button className="btn btn-primary btn-lg w-full mt-6" type="button" disabled={running || rows.length === 0} onClick={() => void run()}>
          {running ? "Reading everything…" : "Run Final Read"}
        </button>
        {running && <p className="caption mt-3">About 40 seconds an essay, two at a time. Keep this page open.</p>}
        {failed.length > 0 && <p className="well px-3 py-2 mt-4 text-[13px] text-neg">Not read: {failed.join(", ")}. Run it again in a minute.</p>}
      </aside>
    </div>
  );
}
