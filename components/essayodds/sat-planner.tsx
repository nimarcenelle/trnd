"use client";

import { useState } from "react";

import type { SatPlan } from "@/lib/essayodds/sat-core";

const errorFor = (status?: number) => {
  if (status === 400) return "We couldn't read a score report there. Upload the score details PDF, or paste the page text.";
  if (status === 413) return "That file is over 8 MB.";
  if (status === 429) return "That's today's limit. Try again tomorrow.";
  return "That didn't go through. Try again in a minute.";
};

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="text-[28px] font-semibold tnum leading-tight mt-1">{value ?? "—"}</div>
    </div>
  );
}

/** Upload or paste a scored practice test; get the skills costing the most points and a three-week plan. */
export default function SatPlanner() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<SatPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData();
    if (file) form.append("file", file);
    form.append("text", text);
    form.append("target", target);
    const res = await fetch("/api/sat/analyze", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(errorFor(res?.status));
    setPlan((await res.json()) as SatPlan);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 items-start">
      <form onSubmit={run} className="card p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <p className="text-[14px] font-semibold">Your scored practice test</p>
          <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">
            In Bluebook, open a finished practice test, choose <span className="font-medium">See Score Details</span>, and save that page as a PDF. Or open it on My Practice and paste the page.
          </p>
        </div>
        <label className="card p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-line-strong">
          <span className="text-[14px] truncate">{file ? file.name : "Upload the score details PDF"}</span>
          <span className="btn btn-secondary btn-sm shrink-0">{file ? "Change" : "Choose PDF"}</span>
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="text-[13px] font-medium">
          Or paste it
          <textarea className="input mt-1.5 w-full !h-32 !py-2 font-normal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Question 1 · Reading and Writing · Craft and Structure · Words in Context · Correct answer B · Your answer C…" />
        </label>
        <label className="text-[13px] font-medium">
          Target score <span className="text-ink-3 font-normal">(optional)</span>
          <input className="input mt-1.5 w-40 tnum" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1500" />
        </label>
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy || (!file && text.trim().length < 80)}>
          {busy ? "Reading your test…" : "Build my SAT plan"}
        </button>
        {error && <p className="text-[13px] text-neg">{error}</p>}
      </form>

      <div aria-live="polite">
        {busy ? (
          <div className="flex flex-col gap-3 animate-pulse" role="status">
            <p className="text-[14px] text-ink-2">Reading every question you missed. About 30 seconds.</p>
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-20 rounded-[12px] bg-muted" />
            ))}
          </div>
        ) : plan ? (
          <div className="flex flex-col gap-4 fade-in">
            <div className="card p-5 grid grid-cols-3 gap-4">
              <Score label="Total" value={plan.total} />
              <Score label="Reading and Writing" value={plan.readingWriting} />
              <Score label="Math" value={plan.math} />
            </div>
            {plan.focus.length > 0 && (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Fix these first</h2>
                <ol className="list-none p-0 m-0 mt-3 flex flex-col gap-4">
                  {plan.focus.map((f, i) => (
                    <li key={f.skill} className="flex gap-3">
                      <span className="h-6 w-6 shrink-0 rounded-full bg-[var(--soft)] text-[var(--soft-ink)] text-[12px] font-semibold tnum flex items-center justify-center">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold">
                          {f.skill} <span className="text-[12px] font-normal text-ink-3">· {f.domain}</span>
                        </p>
                        <p className="text-[13px] text-ink-2 mt-0.5 leading-[1.55]">{f.why}</p>
                        <p className="text-[13px] mt-1 leading-[1.55]">{f.drill}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {plan.missed.length > 0 && (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Where your points went</h2>
                <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
                  {plan.missed.slice(0, 8).map((m) => (
                    <li key={m.skill} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span>
                        {m.skill} <span className="text-ink-3">· {m.domain}</span>
                      </span>
                      <span className="tnum font-semibold">{m.count} missed</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {plan.plan.length > 0 && (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Your three weeks</h2>
                <ol className="list-none p-0 m-0 mt-3 flex flex-col gap-3">
                  {plan.plan.map((w) => (
                    <li key={w.week} className="text-[13px] leading-[1.6]">
                      <span className="font-semibold">Week {w.week}.</span> {w.work}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        ) : (
          <div className="max-w-[420px]">
            <h2 className="text-[16px] font-semibold">What you will get</h2>
            <p className="text-[14px] text-ink-2 leading-[1.6] mt-1.5">Your section scores, the skills costing you the most points counted from the questions you missed, the three to fix first with exactly what to practice, and a three-week plan using College Board&apos;s free official practice.</p>
          </div>
        )}
      </div>
    </div>
  );
}
