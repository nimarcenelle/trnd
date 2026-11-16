"use client";

import { readStore, storeKey } from "@/lib/essayodds/storage";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import Brand from "@/components/brand";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { scoreKind, STATES, validGpa } from "@/lib/essayodds/flow";
import { schoolQuery, shortName, upTo } from "@/lib/essayodds/list";
import { daysToRegularDecision } from "@/lib/essayodds/deadline";
import { PAID_FEATURES, PLANS } from "@/lib/essayodds/plans";
import { PENDING_SCHOOLS, SCHOOLS } from "@/lib/essayodds/schools";

import EssaySample from "./essay-sample";
import OddsTable from "./odds-table";
import { SplitLegend } from "./split";
import RequestSchool from "./request-school";

type Fix = { kind: "round" | "essays" | "activities"; label: string; gain: number };
type Row = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: Fix[]; school: { name: string; edition: string; source: string; note?: string } };

const STORE = storeKey("odds-answers");
const QUESTIONS = 5;
const DRAFT_STORE = storeKey("essay-draft");
const MIN_WORDS = 50;
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Where the essay read stands. */
type EssayRead = { state: "none" | "reading" | "read" | "failed"; score?: number };

function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rise w-full max-w-[620px]">
      <h1 className="display text-[40px] sm:text-[56px]">{title}</h1>
      {sub && <p className="text-[16px] sm:text-[18px] text-ink-2 leading-[1.55] mt-4">{sub}</p>}
      <div className="mt-8 sm:mt-10">{children}</div>
    </div>
  );
}

function Next({ onClick, disabled, label = "Continue", busy, busyLabel = "Working…", hint }: { onClick: () => void; disabled?: boolean; label?: string; busy?: boolean; busyLabel?: string; hint?: boolean }) {
  return (
    <div className="flex items-center gap-4 mt-8">
      <button className="btn btn-primary btn-lg w-full sm:w-auto !h-12 !px-6" type="button" disabled={disabled || busy} onClick={onClick}>
        {busy ? busyLabel : label} {!busy && <IconArrowRight />}
      </button>
      {hint && !disabled && <span className="hidden sm:inline text-[13px] text-ink-3">or press Enter</span>}
    </div>
  );
}

/** Fills in beside the questions as they are answered, so the flow reads as a file being built, not a form. */
function YourFile({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <aside className="hidden lg:flex sticky top-[59px] h-[calc(100dvh-59px)] self-start items-center justify-center bg-subtle border-l border-line px-10">
      <div className="dot-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="card relative w-full max-w-[340px] p-6 shadow-[var(--shadow-lg)]">
        <div className="text-[13px] font-medium text-[var(--kicker)]">Your file</div>
        <ul className="list-none p-0 m-0 mt-4 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.label} className="py-3.5 flex items-start gap-3">
              <span className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full flex items-center justify-center transition-colors ${r.value ? "bg-brand text-[var(--on-action)]" : "border border-line-strong"}`}>{r.value && <IconCheck className="w-[11px] h-[11px]" />}</span>
              <span className="min-w-0">
                <span className="block text-[12px] text-ink-3">{r.label}</span>
                <span key={r.value} className={`block text-[14px] font-medium leading-snug mt-0.5 tnum ${r.value ? "rise" : "text-ink-3 font-normal"}`}>
                  {r.value || "Not yet"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="caption mt-4">No account, no email. Figures from each school&apos;s Common Data Set.</p>
      </div>
    </aside>
  );
}

/** Counts up to the number once, or lands on it straight away when motion is reduced. */
function CountUp({ to }: { to: number }) {
  const [shown, setShown] = useState(to);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      setShown(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <>{shown}</>;
}

const roundGain = (r: Row) => r.fixes.find((f) => f.kind === "round")?.gain ?? 0;
/** The school where the round moves the number most, or the most movable one where none has a round. */
const biggestMove = (rows: Row[]) => [...rows].sort((a, b) => roundGain(b) - roundGain(a) || b.movable - a.movable)[0];

function Reveal({ rows, profile, onNext, open, essay, paid }: { rows: Row[]; profile: string; onNext: () => void; open: boolean; essay: EssayRead; paid: boolean }) {
  const lead = biggestMove(rows);
  const others = rows.filter((r) => r !== lead);
  const round = lead.fixes.find((f) => f.kind === "round");
  const essays = lead.fixes.find((f) => f.kind === "essays");
  const activities = lead.fixes.find((f) => f.kind === "activities");
  return (
    <div className="w-full max-w-[880px] mx-auto">
      <div className="rise flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="section-title text-[32px] sm:text-[40px]">Your odds</h1>
        <span className="text-[13px] text-ink-3 tnum">{profile}</span>
      </div>
      <section className="rise card mt-6 p-6 sm:p-8 shadow-[var(--shadow-lg)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <a className="text-[16px] font-semibold hover:underline" href={lead.school.source} target="_blank" rel="noreferrer">
            {lead.school.name}
          </a>
          <span className="text-[13px] text-ink-3">Where the round moves you most</span>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2 tnum">
          <div className="text-[72px] sm:text-[96px] font-semibold tracking-[-0.04em] leading-[0.9]">
            <CountUp to={lead.odds} />%
          </div>
          <div className="text-[16px] text-ink-2 pb-1">
            {upTo(lead.odds, lead.fixes) === null ? "today" : <>today, up to <span className="font-semibold text-brand">{upTo(lead.odds, lead.fixes)}%</span> by round</>}
          </div>
        </div>
        <div className="mt-6 flex h-3 w-full rounded-full overflow-hidden bg-muted">
          <span className="grow-x bg-locked" style={{ width: `${lead.locked}%` }} />
          <span className="grow-x bg-brand ml-px" style={{ width: `${lead.movable}%`, animationDelay: "0.35s" }} />
        </div>
        <div className="mt-2.5">
          <SplitLegend />
        </div>
        <ul className="list-none p-0 m-0 mt-5 divide-y divide-line border-t border-line">
          {round && (
            <li className="flex items-baseline justify-between gap-4 py-3 text-[14px]">
              <span>{round.label}</span>
              <span className="tnum font-semibold text-brand whitespace-nowrap">+{round.gain} pts</span>
            </li>
          )}
          {essay.state === "read" && (
            <li className="flex items-baseline justify-between gap-4 py-3 text-[14px]">
              <span>{essays?.label ?? "Your essay"}</span>
              {essays ? <span className="tnum font-semibold text-brand whitespace-nowrap">+{essays.gain} pts</span> : <span className="text-[13px] text-ink-3 text-right">Already strong</span>}
            </li>
          )}
          {[...(essay.state === "read" ? [] : [essays?.label ?? "Your essays"]), "Your recommendation letters", activities?.label ?? "How your activities read"].map((label) => (
            <li key={label} className="flex items-baseline justify-between gap-4 py-3 text-[14px]">
              <span>{label}</span>
              <span className="text-[13px] text-ink-3 text-right">Depends on what&apos;s in them</span>
            </li>
          ))}
        </ul>
        {lead.school.note && <p className="caption mt-2">{lead.school.note}</p>}
        {essay.state === "read" &&
          (paid ? (
            <p className="text-[14px] text-ink-2 mt-4 border-t border-line pt-4">
              Your essay is read and these odds count it.{" "}
              <Link className="font-medium text-ink underline" href="/essay">
                See my full review
              </Link>
            </p>
          ) : (
            <div className="well mt-5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[14px] leading-[1.55]">
                <span className="font-semibold">Your essay is read.</span> Its score and the exact lines {essays ? <>costing you <span className="font-semibold text-brand tnum">{essays.gain} pts</span> here</> : "to fix"} are ready.
              </p>
              <button className="btn btn-primary shrink-0" type="button" onClick={onNext}>
                Unlock my fixes
              </button>
            </div>
          ))}
        {essay.state === "failed" && <p className="caption mt-4">We couldn&apos;t read your essay this time, so these odds leave it out. Try again from your essay page.</p>}
      </section>
      {others.length > 0 && (
        <div className="rise mt-4" style={{ animationDelay: "0.25s" }}>
          <OddsTable rows={others.map((r) => ({ key: r.schoolId, name: r.school.name, odds: r.odds, upTo: upTo(r.odds, r.fixes), locked: r.locked, movable: r.movable, fix: r.fixes.find((f) => f.kind === "round") ?? r.fixes[0], source: { href: r.school.source, edition: r.school.edition }, note: r.school.note }))} />
        </div>
      )}
      <p className="caption mt-3">Each school name links to the Common Data Set behind its number. These are estimates, not a promise of an admit.</p>
      {open && <Next onClick={onNext} label="Raise my odds" />}
    </div>
  );
}

/** Five questions, one per screen (the essay is read while the rest are answered), then the odds, then the one thing worth paying for. */
export default function OddsFlow({ paid, open }: { paid: boolean; open: boolean }) {
  // The step lives in the URL so the back button walks the steps. Answers never go in the URL.
  const params = useSearchParams();
  const step = Number(params.get("step")) || 0;
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [gpa, setGpa] = useState("");
  const [score, setScore] = useState("");
  const [home, setHome] = useState("");
  const [essay, setEssay] = useState("");
  const [read, setRead] = useState<EssayRead>({ state: "none" });
  const reading = useRef<Promise<EssayRead> | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  /** Questions the Common App already answered, so the flow doesn't ask them again. */
  const [filled, setFilled] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const focus = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // A browser convenience: a reload keeps the answers. Nothing here leaves the browser until they ask for odds.
  useEffect(() => {
    try {
      const saved = JSON.parse(readStore("odds-answers") ?? "null") as { picked?: string[]; gpa?: string; score?: string; home?: string; essay?: string } | null;
      if (saved?.picked) setPicked(saved.picked.filter((n) => SCHOOLS.some((s) => s.name === n)));
      if (saved?.gpa) setGpa(saved.gpa);
      if (saved?.score) setScore(saved.score);
      if (saved?.home) setHome(saved.home);
      if (saved?.essay) setEssay(saved.essay);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ picked, gpa, score, home, essay }));
    } catch {}
  }, [loaded, picked, gpa, score, home, essay]);

  // A reload starts over from the first question, with the answers still filled in.
  useEffect(() => {
    if (step) window.history.replaceState(null, "", "/odds");
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setError("");
    focus.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);

  function go(next: number) {
    window.history.pushState(null, "", `/odds?step=${next}`);
  }

  const kind = scoreKind(score);
  const enter = (ok: boolean, then: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" && ok) {
      e.preventDefault();
      then();
    }
  };

  /** Starts the reads as soon as the essay is in, so they run while the student answers the rest. */
  function startRead(raw: string) {
    const text = raw.trim();
    // The essay page opens on the same draft.
    try {
      localStorage.setItem(DRAFT_STORE, JSON.stringify({ draft: text, prompt: "", limit: "650", answers: {} }));
    } catch {}
    setRead({ state: "reading" });
    const post = (path: string) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ essay: text, prompt: "", limit: 650 }) });
    // A subscriber's full review keeps going for the essay page; the odds only wait for the quick read.
    if (paid) void post("/api/essays/review")
      .then((res) => {
        if (!res.ok) return;
        try {
          localStorage.setItem(DRAFT_STORE, JSON.stringify({ draft: text, prompt: "", limit: "650", answers: {}, reviewed: true }));
        } catch {}
      })
      .catch(() => {});
    reading.current = post("/api/essays/quick")
      .then(async (res): Promise<EssayRead> => (res.ok ? { state: "read", score: ((await res.json()) as { score: number }).score } : { state: "failed" }))
      .catch((): EssayRead => ({ state: "failed" }))
      .then((r) => {
        setRead(r);
        return r;
      });
  }

  function readEssay() {
    startRead(essay);
    advance(1);
  }

  type Answers = { picked: string[]; essay: string; gpa: string; score: string; home: string };

  /** The next question still unanswered after `from`; with none left, straight to the odds. */
  function advance(from: number, over: Partial<Answers> = {}) {
    const a: Answers = { picked, essay, gpa, score, home, ...over };
    const open = [
      { step: 1, done: Boolean(over.essay) || filled.includes(1) },
      { step: 2, done: validGpa(a.gpa) && (Boolean(over.gpa) || filled.includes(2)) },
      { step: 3, done: Boolean(scoreKind(a.score)) && (Boolean(over.score) || filled.includes(3)) },
      { step: 4, done: Boolean(a.home) && (Boolean(over.home) || filled.includes(4)) },
    ].find((q) => q.step > from && !q.done);
    if (open) go(open.step);
    else void getOdds(a);
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadNote("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/onboard/commonapp", { method: "POST", body: form }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      setUploadNote(res?.status === 413 ? "That file is over 8 MB." : res?.status === 400 ? "That isn't a PDF. Download your Common App preview as a PDF and try again." : "We couldn't read that PDF. Answer the questions instead; it takes a minute.");
      return;
    }
    const f = (await res.json()) as { essay: string; gpa: string; test: string; state: string; schools: string[] };
    const schools = [...new Set([...picked, ...f.schools])];
    const over: Partial<Answers> = { picked: schools };
    setPicked(schools);
    if (f.essay) {
      setEssay(f.essay);
      startRead(f.essay);
      over.essay = f.essay;
    }
    if (f.gpa) setGpa((over.gpa = f.gpa));
    if (f.test) setScore((over.score = f.test));
    if (f.state) setHome((over.home = f.state));
    setFilled([f.essay && 1, f.gpa && 2, f.test && 3, f.state && 4].filter((n): n is number => typeof n === "number"));
    const found = [f.essay && "your essay", f.gpa && "GPA", f.test && "test score", f.state && "home state", f.schools.length && `${f.schools.length} school${f.schools.length === 1 ? "" : "s"}`].filter(Boolean);
    setUploadNote(found.length ? `Filled in ${found.join(", ")} from your Common App.` : "We couldn't find your answers in that PDF. Answer the questions instead.");
    if (schools.length && found.length) advance(0, over);
  }

  function skipEssay() {
    reading.current = null;
    setRead({ state: "none" });
    advance(1);
  }

  async function getOdds(over: Partial<{ picked: string[]; essay: string; gpa: string; score: string; home: string }> = {}) {
    const a = { picked, essay, gpa, score, home, ...over };
    setBusy(true);
    setError("");
    const essayRead = reading.current ? await reading.current : read;
    const res = await fetch("/api/odds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gpa: a.gpa, test: a.score, home: a.home, schools: a.picked.map(schoolQuery).join(", "), essay: essayRead.state === "read" ? a.essay.trim() : "" }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("That did not go through. Try again in a minute.");
      if (step !== 4) go(4);
      return;
    }
    const reply = (await res.json()) as { results: Row[]; essay: number | null };
    setRows(reply.results);
    // The odds count the score the server read from its saved review.
    if (essayRead.state === "read") setRead({ state: "read", score: reply.essay ?? essayRead.score });
    go(5);
  }

  const matches = SCHOOLS.filter((s) => `${s.name} ${shortName(s.name)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const soon = PENDING_SCHOOLS.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const inFlow = step < 5;
  const essayWords = countWords(essay);
  const file = [
    { label: "Schools", value: picked.length ? (picked.length > 3 ? `${picked.slice(0, 3).map(shortName).join(", ")} and ${picked.length - 3} more` : picked.map(shortName).join(", ")) : "" },
    { label: "Essay", value: step >= 2 ? (read.state === "none" ? "Not yet written" : read.state === "reading" ? "Reading now" : read.state === "read" ? `Read, ${read.score}/100` : `${essayWords} words`) : "" },
    { label: "GPA", value: step >= 2 && validGpa(gpa) ? gpa : "" },
    { label: "SAT or ACT", value: step > 3 ? (kind ? `${kind} ${score}` : "No score") : "" },
    { label: "Home state", value: step >= 4 ? (STATES.find(([code]) => code === home)?.[1] ?? "") : "" },
  ];
  const profile = `GPA ${gpa}${kind ? ` · ${kind} ${score}` : ""}`;

  return (
    <div className={`min-h-dvh flex flex-col ${inFlow ? "" : "bg-subtle"}`}>
      <header className="sticky top-0 z-40 bg-ground border-b border-line">
        <div className="flex items-center justify-between h-14 px-5 sm:px-8">
          <Brand />
          <div className="flex items-center gap-3">
            {inFlow && <span className="text-[13px] text-ink-3 tnum">{step + 1} of {QUESTIONS}</span>}
            {step > 0 && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => window.history.back()}>
                Back
              </button>
            )}
          </div>
        </div>
        {inFlow && (
          <div className="h-[3px] bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={QUESTIONS} aria-valuenow={step + 1} aria-label={`Question ${step + 1} of ${QUESTIONS}`}>
            <div className="h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${((step + 1) / QUESTIONS) * 100}%` }} />
          </div>
        )}
      </header>

      <div className={`flex-1 grid grid-cols-[minmax(0,1fr)] ${inFlow ? "lg:grid-cols-[minmax(0,1fr)_440px]" : ""}`}>
        <main key={step} className={`min-w-0 px-5 sm:px-10 py-10 sm:py-16 ${inFlow ? "lg:px-16 xl:px-24 flex lg:items-center" : ""}`}>
          {step === 0 && (
            <Question title="Where are you applying?" sub="Choose every school on your list.">
              <label className={`card mb-6 p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-line-strong transition-colors ${uploading ? "opacity-70 pointer-events-none" : ""}`}>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{uploading ? "Reading your Common App…" : "Skip the questions: upload your Common App"}</span>
                  <span className="block text-[13px] text-ink-2 mt-0.5">The PDF preview from Common App. We fill in your essay, GPA, scores and state, then delete the file.</span>
                </span>
                <span className="btn btn-secondary shrink-0">{uploading ? "Reading…" : "Upload PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </label>
              {uploadNote && <p className="text-[13px] text-ink-2 -mt-3 mb-5">{uploadNote}{picked.length ? "" : " Now pick your schools."}</p>}
              {busy && <p className="text-[13px] font-medium text-brand -mt-3 mb-5">{read.state === "reading" ? "Reading your essay and working out your odds…" : "Working out your odds…"}</p>}
              <input ref={(el) => void (focus.current = el)} className="input !h-12 w-full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search schools" aria-label="Search schools" />
              <ul className="list-none p-0 m-0 mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {matches.map((s) => {
                  const on = picked.includes(s.name);
                  return (
                    <li key={s.id}>
                      <button type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((n) => n !== s.name) : [...p, s.name]))} className={`group w-full h-12 px-3 rounded-[10px] border flex items-center justify-between gap-2 text-[14px] text-left cursor-pointer font-[inherit] transition-all ${on ? "border-locked bg-[var(--soft)] font-medium text-ink shadow-[var(--shadow-sm)]" : "border-line bg-bg text-ink hover:border-line-strong hover:shadow-[var(--shadow-sm)]"}`}>
                        <span className="truncate">{shortName(s.name)}</span>
                        <span className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center transition-colors ${on ? "bg-brand text-[var(--on-action)]" : "border border-line-strong"}`}>{on && <IconCheck className="w-2.5 h-2.5" />}</span>
                      </button>
                    </li>
                  );
                })}
                {soon.map((s) => (
                  <li key={s.name} className="h-12 px-3 rounded-[10px] border border-dashed border-line flex items-center justify-between gap-2 text-[14px] text-ink-3">
                    <span className="truncate">{shortName(s.name)}</span>
                    <span className="text-[11px] shrink-0">Soon</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-[14px]">
                {requesting ? (
                  <RequestSchool />
                ) : (
                  <button type="button" className="text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]" onClick={() => setRequesting(true)}>
                    Don&apos;t see your school?
                  </button>
                )}
              </div>
              <div className="sticky bottom-0 -mx-5 sm:mx-0 px-5 sm:px-0 pb-4 bg-ground">
                <Next disabled={!picked.length} onClick={() => advance(0)} label={picked.length ? `Continue with ${picked.length}` : "Continue"} />
              </div>
            </Question>
          )}

          {step === 1 && (
            <Question title="Paste your personal statement." sub="Our AI reads it while you answer the rest, and your odds count it. Not written yet? Skip it and add it later.">
              <textarea
                className="input w-full !h-[280px] !py-3 text-[16px] leading-[1.65] resize-y"
                value={essay}
                onChange={(e) => {
                  setEssay(e.target.value);
                  reading.current = null;
                  setRead({ state: "none" });
                }}
                placeholder="Paste your Common App essay or your best draft."
                aria-label="Your personal statement"
              />
              <p className={`text-[13px] mt-2 tnum ${essayWords > 650 ? "text-neg" : "text-ink-3"}`}>
                {essayWords} / 650 words{essayWords > 0 && essayWords < MIN_WORDS ? ` · ${MIN_WORDS} words to read it` : ""}
              </p>
              <Next disabled={essayWords < MIN_WORDS || essayWords > 1000} onClick={readEssay} label="Read my essay" />
              <button className="mt-4 text-[14px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]" type="button" onClick={skipEssay}>
                I haven&apos;t written it yet
              </button>
              <p className="caption mt-3">Saved encrypted, never sold.</p>
            </Question>
          )}

          {step === 2 && (
            <Question title="What's your GPA?" sub="Unweighted on a 4.0 scale is best. Your best estimate is fine.">
              <input ref={(el) => void (focus.current = el)} className="flow-input" inputMode="decimal" value={gpa} onChange={(e) => setGpa(e.target.value)} onKeyDown={enter(validGpa(gpa), () => advance(2))} placeholder="3.70" aria-label="GPA" />
              {gpa.trim() !== "" && !validGpa(gpa) && <p className="text-[13px] text-neg mt-2">Enter a GPA between 0 and 5.</p>}
              <Next disabled={!validGpa(gpa)} onClick={() => advance(2)} hint />
            </Question>
          )}

          {step === 3 && (
            <Question title="Your SAT or ACT?" sub="Your best score. We can tell which test it is.">
              <input ref={(el) => void (focus.current = el)} className="flow-input" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} onKeyDown={enter(Boolean(kind), () => advance(3))} placeholder="1350" aria-label="SAT or ACT score" />
              {kind === null && <p className="text-[13px] text-neg mt-2">An SAT runs 400 to 1600, an ACT 1 to 36.</p>}
              {kind && <p className="text-[13px] font-medium text-brand mt-2">{kind}</p>}
              <Next disabled={!kind} onClick={() => advance(3)} hint />
              <button
                className="mt-4 text-[14px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]"
                type="button"
                onClick={() => {
                  setScore("");
                  advance(3, { score: "" });
                }}
              >
                I don&apos;t have a score
              </button>
            </Question>
          )}

          {step === 4 && (
            <Question title="Where do you live?" sub="Public universities admit in-state students at very different rates.">
              <select ref={(el) => void (focus.current = el)} className="flow-input !text-[32px] cursor-pointer" value={home} onChange={(e) => setHome(e.target.value)} onKeyDown={enter(Boolean(home), () => void getOdds())} aria-label="Home state">
                <option value="">Choose a state</option>
                {STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              {error && <p className="text-[13px] text-neg mt-2">{error}</p>}
              <Next disabled={!home} busy={busy} onClick={() => void getOdds()} label="See my odds" busyLabel={read.state === "reading" ? "Reading your essay…" : "Working…"} hint />
              {busy && read.state === "reading" && <p className="caption mt-3">Your essay takes about a minute to read. Your odds follow straight after.</p>}
              <p className="caption mt-3">No account, no email.</p>
            </Question>
          )}

          {step === 5 && rows.length > 0 && <Reveal rows={rows} profile={profile} onNext={() => go(6)} open={open} essay={read} paid={paid} />}

          {step === 6 && (
            <div className="w-full max-w-[1000px] mx-auto grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 items-center">
              <div className="rise min-w-0">
                <p className="text-[14px] font-semibold text-brand tnum">{daysToRegularDecision()} days until most regular-decision deadlines</p>
                <h1 className="display text-[40px] sm:text-[56px] mt-3">{read.state === "read" ? "Your essay is leaving points on the table." : "Your essays decide the rest."}</h1>
                <p className="text-[16px] sm:text-[18px] text-ink-2 leading-[1.55] mt-4">Your grades and scores are set. Your essays aren&apos;t. Get your score, every line that&apos;s costing you marked with the fix, and rewrites in your own voice, tonight. Every supplement, every revision, until you submit.</p>
                <div className="mt-8">
                  <EssaySample />
                </div>

              </div>
              <div className="rise rounded-[20px] bg-band text-band-ink p-8 shadow-[var(--shadow-lg)]" style={{ animationDelay: "0.15s" }}>
                <div className="text-[14px] font-medium text-band-ink-3">{PLANS.rd.name}, through January 15</div>
                <div className="mt-2 flex items-baseline gap-2 leading-none">
                  <span className="text-[56px] font-semibold tnum tracking-[-0.03em]">{PLANS.rd.price}</span>
                  <span className="text-[15px] text-band-ink-3">{PLANS.rd.per}</span>
                </div>
                <p className="text-[13px] text-band-ink-3 leading-[1.5] mt-3">{PLANS.rd.billed}</p>
                <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3 text-[14px] border-t border-band-line pt-6">
                  {PAID_FEATURES.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <IconCheck className="mt-[3px] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                {paid ? (
                  <Link href="/essay" className="btn btn-lg w-full mt-8 !h-12 !bg-bg !text-ink">
                    Open your essays
                  </Link>
                ) : (
                  <>
                    <form action="/api/essays/checkout" method="post" className="mt-8">
                      <input type="hidden" name="plan" value="rd" />
                      <button className="btn btn-lg w-full !h-12 !bg-bg !text-ink" type="submit">
                        {PLANS.rd.cta}
                      </button>
                    </form>
                    <form action="/api/essays/checkout" method="post" className="mt-4">
                      <input type="hidden" name="plan" value="week" />
                      <button className="w-full text-[13px] text-band-ink underline cursor-pointer bg-transparent border-0 p-0 font-[inherit]" type="submit">
                        Just one week? {PLANS.week.short}
                      </button>
                    </form>
                    <p className="text-[12px] text-band-ink-3 text-center mt-3 leading-[1.5]">
                      Parent paying?{" "}
                      <Link className="underline" href="/pay">
                        Send them this link
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
        {inFlow && <YourFile rows={file} />}
      </div>
    </div>
  );
}
