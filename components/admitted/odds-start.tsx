"use client";

import { useState, type FormEvent } from "react";

import { IconArrowRight } from "@/components/icons";

import { SplitBar } from "./split";

type Row = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: { label: string; gain: number }[]; school: { name: string; edition: string; source: string } };
type Reply = { results: Row[]; pending: string[]; unknown: string[] };

/** The hero's inline input: GPA, a test score and the schools, answered with real odds. */
export default function OddsStart({ cta = "See my odds" }: { cta?: string }) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { gpa: String(form.get("gpa") ?? ""), test: String(form.get("test") ?? ""), schools: String(form.get("schools") ?? "") };
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/odds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setReply((await res.json()) as Reply);
      return;
    }
    setReply(null);
    if (res?.status === 503) setMessage("Free odds are not open yet. Until then, the numbers below are a sample applicant.");
    else if (res?.status === 400) setMessage("Check your GPA and score. An SAT runs 400 to 1600, an ACT 1 to 36.");
    else setMessage("That did not go through. Try again in a minute.");
  }

  return (
    <div className="w-full max-w-[640px]">
      <form className="sitebox flex-col sm:flex-row !items-stretch sm:!items-center !gap-0 sm:!gap-1.5 !p-1.5 sm:!pl-1.5" onSubmit={(e) => void submit(e)}>
        <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[92px] border-b sm:border-b-0 sm:border-r border-line text-left">
          <span className="text-[11px] text-ink-3">GPA</span>
          <input name="gpa" inputMode="decimal" placeholder="3.95" aria-label="GPA" className="!h-6 !text-[14px] tnum" required />
        </label>
        <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[118px] border-b sm:border-b-0 sm:border-r border-line text-left">
          <span className="text-[11px] text-ink-3">SAT or ACT</span>
          <input name="test" inputMode="numeric" placeholder="1530" aria-label="SAT or ACT score" className="!h-6 !text-[14px] tnum" />
        </label>
        <label className="flex flex-col justify-center px-3 py-1.5 flex-1 min-w-0 text-left">
          <span className="text-[11px] text-ink-3">Schools</span>
          <input name="schools" placeholder="Dartmouth, Cornell, up to 20" aria-label="Schools" className="!h-6 !text-[14px]" required />
        </label>
        <button className="btn btn-primary btn-lg mt-1.5 sm:mt-0" type="submit" disabled={busy}>
          {busy ? "Working…" : cta} <IconArrowRight />
        </button>
      </form>
      <p className="caption mt-3" role="status">
        {message || (reply ? "" : "Free, no account: your odds, the locked/movable split and your top fix.")}
      </p>
      {reply && (
        <div className="card mt-3 divide-y divide-line text-left">
          {reply.results.map((r) => (
            <div key={r.schoolId} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <a className="text-[14px] font-medium hover:underline" href={r.school.source} target="_blank" rel="noreferrer">
                  {r.school.name}
                </a>
                <span className="tnum text-[14px]">
                  <span className="font-semibold">{r.odds}%</span> <span className="text-ink-3">→</span> <span className="font-semibold text-brand">{r.withFixes}%</span>
                </span>
              </div>
              <SplitBar className="mt-2" locked={r.locked} movable={r.movable} />
              {r.fixes[0] && (
                <div className="flex justify-between gap-3 text-[13px] mt-2">
                  <span className="text-ink-2">{r.fixes[0].label}</span>
                  <span className="tnum font-medium text-brand whitespace-nowrap">+{r.fixes[0].gain} pts</span>
                </div>
              )}
            </div>
          ))}
          {(reply.pending.length > 0 || reply.unknown.length > 0) && <p className="caption p-4">Not covered yet: {[...reply.pending, ...reply.unknown].join(", ")}.</p>}
        </div>
      )}
    </div>
  );
}
