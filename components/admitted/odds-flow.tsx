"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import Brand from "@/components/brand";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { scoreKind, STATES, validGpa } from "@/lib/admitted/flow";
import { schoolQuery, shortName } from "@/lib/admitted/list";
import { PENDING_SCHOOLS, SCHOOLS } from "@/lib/admitted/schools";

import EssaySample from "./essay-sample";
import OddsTable from "./odds-table";
import { SplitLegend } from "./split";
import RequestSchool from "./request-school";

type Fix = { kind: "round" | "essays" | "activities"; label: string; gain: number };
type Row = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: Fix[]; school: { name: string; edition: string; source: string; note?: string } };

const STORE = "admitted-odds-answers";
const QUESTIONS = 4;

function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rise w-full max-w-[620px]">
      <h1 className="display text-[40px] sm:text-[56px]">{title}</h1>
      {sub && <p className="text-[16px] sm:text-[18px] text-ink-2 leading-[1.55] mt-4">{sub}</p>}
      <div className="mt-8 sm:mt-10">{children}</div>
    </div>
  );
}

function Next({ onClick, disabled, label = "Continue", busy, hint }: { onClick: () => void; disabled?: boolean; label?: string; busy?: boolean; hint?: boolean }) {
  return (
    <div className="flex items-center gap-4 mt-8">
      <button className="btn btn-primary btn-lg w-full sm:w-auto !h-12 !px-6" type="button" disabled={disabled || busy} onClick={onClick}>
        {busy ? "Working…" : label} {!busy && <IconArrowRight />}
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

const biggestMove = (rows: Row[]) => [...rows].sort((a, b) => b.withFixes - b.odds - (a.withFixes - a.odds))[0];

function Reveal({ rows, profile, onNext, open }: { rows: Row[]; profile: string; onNext: () => void; open: boolean }) {
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
          <span className="text-[13px] text-ink-3">Where you can move the most</span>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2 tnum">
          <div className="text-[72px] sm:text-[96px] font-semibold tracking-[-0.04em] leading-[0.9]">
            <CountUp to={lead.odds} />%
          </div>
          <div className="text-[16px] text-ink-2 pb-1">
            today, up to <span className="font-semibold text-brand">{lead.withFixes}%</span>
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
          {[essays?.label ?? "Your essays", "Your recommendation letters", activities?.label ?? "How your activities read"].map((label) => (
            <li key={label} className="flex items-baseline justify-between gap-4 py-3 text-[14px]">
              <span>{label}</span>
              <span className="text-[13px] text-ink-3 text-right">Depends on what&apos;s in them</span>
            </li>
          ))}
        </ul>
        {lead.school.note && <p className="caption mt-2">{lead.school.note}</p>}
      </section>
      {others.length > 0 && (
        <div className="rise mt-4" style={{ animationDelay: "0.25s" }}>
          <OddsTable rows={others.map((r) => ({ key: r.schoolId, name: r.school.name, odds: r.odds, withFixes: r.withFixes, locked: r.locked, movable: r.movable, fix: r.fixes[0], source: { href: r.school.source, edition: r.school.edition }, note: r.school.note }))} />
        </div>
      )}
      <p className="caption mt-3">Each school name links to the Common Data Set behind its number. These are estimates, not a promise of an admit.</p>
      {open && <Next onClick={onNext} label="See what moves it" />}
    </div>
  );
}

/** Four questions, one per screen, then the odds, then the one thing worth paying for. */
export default function OddsFlow({ paid, open }: { paid: boolean; open: boolean }) {
  // The step lives in the URL so the back button walks the steps. Answers never go in the URL.
  const params = useSearchParams();
  const step = Number(params.get("step")) || 0;
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [gpa, setGpa] = useState("");
  const [score, setScore] = useState("");
  const [home, setHome] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const focus = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // A browser convenience: a reload keeps the answers. Nothing here leaves the browser until they ask for odds.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { picked?: string[]; gpa?: string; score?: string; home?: string } | null;
      if (saved?.picked) setPicked(saved.picked.filter((n) => SCHOOLS.some((s) => s.name === n)));
      if (saved?.gpa) setGpa(saved.gpa);
      if (saved?.score) setScore(saved.score);
      if (saved?.home) setHome(saved.home);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ picked, gpa, score, home }));
    } catch {}
  }, [loaded, picked, gpa, score, home]);

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

  async function getOdds() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/odds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gpa, test: score, home, schools: picked.map(schoolQuery).join(", ") }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("That did not go through. Try again in a minute.");
      return;
    }
    const reply = (await res.json()) as { results: Row[] };
    setRows(reply.results);
    go(4);
  }

  const matches = SCHOOLS.filter((s) => `${s.name} ${shortName(s.name)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const soon = PENDING_SCHOOLS.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const inFlow = step < 4;
  const file = [
    { label: "Schools", value: picked.length ? (picked.length > 3 ? `${picked.slice(0, 3).map(shortName).join(", ")} and ${picked.length - 3} more` : picked.map(shortName).join(", ")) : "" },
    { label: "GPA", value: step >= 1 && validGpa(gpa) ? gpa : "" },
    { label: "SAT or ACT", value: step > 2 ? (kind ? `${kind} ${score}` : "No score") : "" },
    { label: "Home state", value: step >= 3 ? (STATES.find(([code]) => code === home)?.[1] ?? "") : "" },
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
                <Next disabled={!picked.length} onClick={() => go(1)} label={picked.length ? `Continue with ${picked.length}` : "Continue"} />
              </div>
            </Question>
          )}

          {step === 1 && (
            <Question title="What's your GPA?" sub="Unweighted on a 4.0 scale is best. Your best estimate is fine.">
              <input ref={(el) => void (focus.current = el)} className="flow-input" inputMode="decimal" value={gpa} onChange={(e) => setGpa(e.target.value)} onKeyDown={enter(validGpa(gpa), () => go(2))} placeholder="3.70" aria-label="GPA" />
              {gpa.trim() !== "" && !validGpa(gpa) && <p className="text-[13px] text-neg mt-2">Enter a GPA between 0 and 5.</p>}
              <Next disabled={!validGpa(gpa)} onClick={() => go(2)} hint />
            </Question>
          )}

          {step === 2 && (
            <Question title="Your SAT or ACT?" sub="Your best score. We can tell which test it is.">
              <input ref={(el) => void (focus.current = el)} className="flow-input" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} onKeyDown={enter(Boolean(kind), () => go(3))} placeholder="1350" aria-label="SAT or ACT score" />
              {kind === null && <p className="text-[13px] text-neg mt-2">An SAT runs 400 to 1600, an ACT 1 to 36.</p>}
              {kind && <p className="text-[13px] font-medium text-brand mt-2">{kind}</p>}
              <Next disabled={!kind} onClick={() => go(3)} hint />
              <button
                className="mt-4 text-[14px] text-ink-2 underline hover:text-ink cursor-pointer bg-transparent border-0 p-0 font-[inherit]"
                type="button"
                onClick={() => {
                  setScore("");
                  go(3);
                }}
              >
                I don&apos;t have a score
              </button>
            </Question>
          )}

          {step === 3 && (
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
              <Next disabled={!home} busy={busy} onClick={() => void getOdds()} label="See my odds" hint />
              <p className="caption mt-3">Free, no account, no email.</p>
            </Question>
          )}

          {step === 4 && rows.length > 0 && <Reveal rows={rows} profile={profile} onNext={() => go(5)} open={open} />}

          {step === 5 && (
            <div className="w-full max-w-[1000px] mx-auto grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 items-center">
              <div className="rise min-w-0">
                <h1 className="display text-[40px] sm:text-[56px]">How far this moves depends on your essays.</h1>
                <p className="text-[16px] sm:text-[18px] text-ink-2 leading-[1.55] mt-4">Nobody can size an essay without reading it. We read your draft line by line, mark what costs you most, ask for the details only you know, and rewrite it in your voice.</p>
                <div className="mt-8">
                  <EssaySample />
                </div>
              </div>
              <div className="rise rounded-[20px] bg-band text-band-ink p-8 shadow-[var(--shadow-lg)]" style={{ animationDelay: "0.15s" }}>
                <div className="text-[14px] font-medium text-band-ink-3">Essays</div>
                <div className="text-[56px] font-semibold tnum tracking-[-0.03em] mt-2 leading-none">$299</div>
                <p className="text-[13px] text-band-ink-3 leading-[1.5] mt-3">Pay once per cycle. No subscription. Full refund within 14 days.</p>
                <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3 text-[14px] border-t border-band-line pt-6">
                  {["Line-by-line review of your draft", "Rewrite in your voice", "Unlimited revisions through the cycle"].map((item) => (
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
                    <form action="/api/essays/checkout" method="post">
                      <button className="btn btn-lg w-full mt-8 !h-12 !bg-bg !text-ink" type="submit">
                        Fix the movable part
                      </button>
                    </form>
                    <p className="text-[12px] text-band-ink-3 text-center mt-3">Pay once. No subscription.</p>
                    <p className="text-[12px] text-band-ink-3 text-center mt-1 leading-[1.5]">
                      By paying you agree to the{" "}
                      <Link className="underline" href="/terms">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link className="underline" href="/privacy">
                        Privacy Policy
                      </Link>
                      . Under 18? A parent or guardian must pay.
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
