"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { IconArrowRight, IconCheck } from "@/components/icons";
import { schoolQuery, shortName } from "@/lib/admitted/list";
import { PENDING_SCHOOLS, SCHOOLS } from "@/lib/admitted/schools";

import OddsTable from "./odds-table";
import OddsToy from "./odds-toy";

type Row = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: { label: string; gain: number }[]; school: { name: string; edition: string; source: string; satNote?: string } };
type Reply = { results: Row[]; pending: string[]; unknown: string[] };

function SchoolPicker({ picked, toggle, setAll }: { picked: string[]; toggle: (name: string) => void; setAll: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const all = SCHOOLS.map((s) => s.name);
  return (
    <div ref={box} className="relative flex-1 min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full h-full flex flex-col justify-center px-3 py-1.5 text-left cursor-pointer bg-transparent border-0 font-[inherit]">
        <span className="text-[11px] text-ink-3">Schools</span>
        <span className={`block h-6 leading-6 text-[14px] truncate ${picked.length ? "text-ink" : "text-ink-3"}`}>{picked.length ? picked.map(shortName).join(", ") : "Choose your schools"}</span>
      </button>
      {open && (
        <div className="card absolute left-0 right-0 sm:right-auto sm:w-[340px] top-[calc(100%+10px)] z-30 p-2 shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[12px] text-ink-3 tnum">{picked.length} chosen</span>
            <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]" onClick={() => setAll(picked.length === all.length ? [] : all)}>
              {picked.length === all.length ? "Clear" : "Choose all"}
            </button>
          </div>
          <ul className="list-none p-0 m-0 grid grid-cols-2 gap-0.5 max-h-[300px] overflow-y-auto">
            {SCHOOLS.map((s) => {
              const on = picked.includes(s.name);
              return (
                <li key={s.id}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(s.name)} className={`w-full h-8 px-2 rounded-[7px] flex items-center justify-between gap-2 text-[13px] text-left cursor-pointer border-0 font-[inherit] ${on ? "bg-[var(--soft)] text-ink font-medium" : "bg-transparent text-ink-2 hover:bg-muted"}`}>
                    {shortName(s.name)}
                    {on && <IconCheck className="text-brand shrink-0" />}
                  </button>
                </li>
              );
            })}
            {PENDING_SCHOOLS.map((s) => (
              <li key={s.name} className="h-8 px-2 flex items-center justify-between gap-2 text-[13px] text-ink-3">
                {shortName(s.name)} <span className="text-[11px]">Soon</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The hero: the headline, the odds form and the working sample, then the real results at full width. */
export default function HeroOdds({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [profile, setProfile] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const results = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reply) results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reply]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked.length) {
      setMessage("Choose at least one school.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const gpa = String(form.get("gpa") ?? "");
    const test = String(form.get("test") ?? "");
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/odds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gpa, test, schools: picked.map(schoolQuery).join(", ") }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setProfile(`GPA ${gpa}${test ? ` · ${Number(test) > 36 ? "SAT" : "ACT"} ${test}` : ""}`);
      setReply((await res.json()) as Reply);
      return;
    }
    setReply(null);
    if (res?.status === 400) setMessage("Check your GPA and score. An SAT runs 400 to 1600, an ACT 1 to 36.");
    else setMessage("That did not go through. Try again in a minute.");
  }

  const rows = reply?.results ?? [];
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14 items-center">
        <div>
          {children}
          <div className="mt-8 w-full max-w-[640px]">
            <form className="sitebox flex-col sm:flex-row !items-stretch sm:!items-center !gap-0 sm:!gap-1.5 !p-1.5 sm:!pl-1.5" onSubmit={(e) => void submit(e)}>
              <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[92px] border-b sm:border-b-0 sm:border-r border-line text-left">
                <span className="text-[11px] text-ink-3">GPA</span>
                <input name="gpa" inputMode="decimal" placeholder="3.95" aria-label="GPA" className="!h-6 !text-[14px] tnum" required />
              </label>
              <label className="flex flex-col justify-center px-3 py-1.5 sm:w-[118px] border-b sm:border-b-0 sm:border-r border-line text-left">
                <span className="text-[11px] text-ink-3">SAT or ACT</span>
                <input name="test" inputMode="numeric" placeholder="1530" aria-label="SAT or ACT score" className="!h-6 !text-[14px] tnum" />
              </label>
              <SchoolPicker picked={picked} toggle={(name) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))} setAll={setPicked} />
              <button className="btn btn-primary btn-lg mt-1.5 sm:mt-0" type="submit" disabled={busy}>
                {busy ? "Working…" : "See my odds"} <IconArrowRight />
              </button>
            </form>
            <p className={`caption mt-3 ${message ? "!text-neg" : ""}`} role="status">
              {message || "Free, no account: your odds, the locked and movable split, and your top fix."}
            </p>
          </div>
        </div>
        <OddsToy />
      </div>

      {rows.length > 0 && (
        <div ref={results} className="fade-in mt-14 scroll-mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 className="section-title text-[32px]">Your odds</h2>
            <span className="text-[13px] text-ink-3 tnum">{profile}</span>
          </div>
          <OddsTable rows={rows.map((r) => ({ key: r.schoolId, name: r.school.name, odds: r.odds, withFixes: r.withFixes, locked: r.locked, movable: r.movable, fix: r.fixes[0], source: { href: r.school.source, edition: r.school.edition }, note: r.school.satNote }))} />
          <div className="card mt-3 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-band border-band-line">
            <div>
              <p className="text-[16px] font-semibold text-band-ink">Your essays are part of what still moves.</p>
              <p className="text-[14px] text-band-ink-3 mt-0.5">A line-by-line review of every draft, and a rewrite in your voice.</p>
            </div>
            <Link href="/essay" className="btn btn-lg shrink-0 !bg-bg !text-ink">
              Fix the movable part · $299
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
