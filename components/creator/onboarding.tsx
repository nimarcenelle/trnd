"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { runOnboardingAction } from "@/lib/creator/actions";
import { GOALS } from "@/lib/creator/funnel";

/**
 * The check as a conversation: one question a screen, Enter to go on, letter
 * keys for choices. Then the analysis, narrated, and the report. The last
 * answer (the email) is what starts the read, so nothing is spent on someone
 * who leaves halfway.
 */

type Step = "platform" | "handle" | "niche" | "goal" | "email" | "running";
const ORDER: Step[] = ["platform", "handle", "niche", "goal", "email"];
const NICHES = ["Fitness", "Food", "Beauty", "Fashion", "Comedy", "Travel", "Personal finance", "Gaming", "Parenting", "Tech"];
const LETTERS = "ABCDEFGH";

/** What the read is doing, by the second it usually gets there. One call does it all, so this is a clock, not a signal. */
const RUN: { at: number; label: (h: string, n: string) => string }[] = [
  { at: 0, label: (h) => `Reading @${h}'s last 12 posts` },
  { at: 18, label: () => "Measuring every post against your usual" },
  { at: 32, label: (_h, n) => `Pulling the top posts in ${n ? n.toLowerCase() : "your niche"} right now` },
  { at: 65, label: () => "Comparing you with the creators beating you" },
  { at: 85, label: () => "Finding what's killing your posts" },
  { at: 105, label: () => "Writing what to post instead" },
];

const isHandle = (h: string) => /^[a-z0-9._]{2,30}$/.test(h.trim().replace(/^@/, "").toLowerCase());

function Option({ letter, label, selected, onClick }: { letter: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 w-full text-left rounded-[12px] border px-4 py-3.5 text-[17px] font-medium transition-colors ${
        selected ? "border-ink bg-subtle shadow-[0_0_0_1px_var(--ink)]" : "border-line-strong hover:bg-subtle"
      }`}
    >
      <span className={`w-7 h-7 rounded-[7px] grid place-items-center text-[12px] font-semibold border ${selected ? "bg-ink text-bg border-ink" : "border-line-strong text-ink-2"}`}>{letter}</span>
      {label}
    </button>
  );
}

export default function Onboarding({ initial }: { initial: { platform: "tiktok" | "instagram" | ""; handle: string; src: string } }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial.platform && initial.handle && isHandle(initial.handle) ? "niche" : initial.platform ? "handle" : "platform");
  const [platform, setPlatform] = useState<"tiktok" | "instagram" | "">(initial.platform);
  const [handle, setHandle] = useState(initial.handle.replace(/^@/, ""));
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const index = ORDER.indexOf(step as (typeof ORDER)[number]);
  const progress = step === "running" ? 100 : ((index + 0.5) / ORDER.length) * 100;
  const cleanHandle = handle.trim().replace(/^@/, "").toLowerCase();

  const next = () => {
    setError("");
    if (step === "handle" && !isHandle(handle)) return setError("That doesn't look like a handle. Try @yourname.");
    if (step === "email") return run();
    const i = ORDER.indexOf(step as (typeof ORDER)[number]);
    if (i >= 0 && i < ORDER.length - 1) setStep(ORDER[i + 1]);
  };
  const back = () => {
    setError("");
    const i = ORDER.indexOf(step as (typeof ORDER)[number]);
    if (i > 0) setStep(ORDER[i - 1]);
  };

  function run() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter an email address, like you@example.com.");
    setStep("running");
    setSeconds(0);
    startTransition(async () => {
      const r = await runOnboardingAction({ platform, handle: cleanHandle, niche, goal, email: email.trim(), src: initial.src });
      if ("error" in r) {
        setError(r.error);
        setStep(r.step ?? "email");
        return;
      }
      router.push(`/r/${r.id}?k=${r.token}`);
    });
  }

  // Focus the field on each text step.
  useEffect(() => {
    if (step === "handle" || step === "niche" || step === "email") setTimeout(() => input.current?.focus(), 60);
  }, [step]);

  // The narration's clock while the read runs.
  useEffect(() => {
    if (step !== "running") return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [step]);

  // Letter keys pick a choice; Enter goes on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === "running") return;
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Enter") {
        e.preventDefault();
        if (step === "platform" && !platform) return;
        next();
        return;
      }
      if (typing) return;
      const k = LETTERS.indexOf(e.key.toUpperCase());
      if (step === "platform" && k >= 0 && k < 2) {
        setPlatform(k === 0 ? "tiktok" : "instagram");
        setTimeout(() => setStep("handle"), 180);
      }
      if (step === "goal" && k >= 0 && k < GOALS.length) {
        setGoal(GOALS[k]);
        setTimeout(() => setStep("email"), 180);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const field = "w-full bg-transparent border-0 border-b-2 border-line-strong focus:border-ink outline-none text-[28px] sm:text-[34px] font-medium tracking-[-0.02em] py-2 placeholder:text-ink-3/60";
  const current = RUN.filter((s) => s.at <= seconds).length - 1;

  return (
    <div className="fixed inset-0 bg-bg flex flex-col">
      <div className="h-1 bg-muted">
        <div className="h-full bg-ink transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between px-5 sm:px-8 h-14">
        <a href="/creators" className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[0.3em]">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          TRND
        </a>
        {step !== "running" && index > 0 && (
          <button type="button" onClick={back} className="text-[13px] text-ink-3 hover:text-ink">
            ← Back
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div key={step} className="rise min-h-full max-w-[640px] mx-auto px-5 sm:px-8 flex flex-col justify-center py-10">
          {step !== "running" && (
            <div className="text-[13px] text-brand font-medium mb-3 tnum">
              {index + 1} → {ORDER.length}
            </div>
          )}

          {step === "platform" && (
            <>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">Where are your posts flopping?</h1>
              <div className="flex flex-col gap-2.5 mt-8 max-w-[380px]">
                {(["tiktok", "instagram"] as const).map((p, i) => (
                  <Option
                    key={p}
                    letter={LETTERS[i]}
                    label={p === "tiktok" ? "TikTok" : "Instagram"}
                    selected={platform === p}
                    onClick={() => {
                      setPlatform(p);
                      setTimeout(() => setStep("handle"), 180);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {step === "handle" && (
            <>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">What&apos;s your {platform === "instagram" ? "Instagram" : "TikTok"} handle?</h1>
              <p className="text-[16px] text-ink-2 mt-3 mb-0">We only read public posts. We never ask for your login.</p>
              <input ref={input} value={handle ? `@${handle.replace(/^@/, "")}` : ""} onChange={(e) => setHandle(e.target.value.replace(/^@+/, ""))} placeholder="@yourhandle" autoComplete="off" autoCapitalize="none" spellCheck={false} className={`${field} mt-8`} />
            </>
          )}

          {step === "niche" && (
            <>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">What do you post about?</h1>
              <p className="text-[16px] text-ink-2 mt-3 mb-0">We&apos;ll measure you against the top creators in it. Skip it and we&apos;ll work it out from your posts.</p>
              <input ref={input} value={niche} onChange={(e) => setNiche(e.target.value.slice(0, 80))} placeholder="e.g. home workouts" className={`${field} mt-8`} />
              <div className="flex flex-wrap gap-2 mt-5">
                {NICHES.map((n) => (
                  <button key={n} type="button" onClick={() => setNiche(n)} className={`h-8 px-3 rounded-full border text-[13.5px] ${niche === n ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:bg-subtle"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "goal" && (
            <>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">What do you want most?</h1>
              <div className="flex flex-col gap-2.5 mt-8 max-w-[420px]">
                {GOALS.map((g, i) => (
                  <Option
                    key={g}
                    letter={LETTERS[i]}
                    label={g}
                    selected={goal === g}
                    onClick={() => {
                      setGoal(g);
                      setTimeout(() => setStep("email"), 180);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {step === "email" && (
            <>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">Where should we send your report?</h1>
              <p className="text-[16px] text-ink-2 mt-3 mb-0">So you don&apos;t lose it. No spam.</p>
              <input ref={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`${field} mt-8`} />
            </>
          )}

          {step === "running" && (
            <div>
              <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1] m-0">Finding out why @{cleanHandle}&apos;s posts flop.</h1>
              <ul className="list-none m-0 p-0 mt-10 flex flex-col gap-4 text-[17px]">
                {RUN.map((s, i) => (
                  <li key={s.at} className={`flex items-center gap-3 transition-opacity duration-500 ${i > current ? "opacity-30" : ""}`}>
                    {i < current ? (
                      <span className="w-5 h-5 rounded-full bg-ink text-bg grid place-items-center text-[11px]">✓</span>
                    ) : i === current ? (
                      <span className="spinner !w-5 !h-5" />
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-line-strong" />
                    )}
                    {s.label(cleanHandle, niche)}
                  </li>
                ))}
              </ul>
              <p className="caption mt-8">Usually one to two minutes. Keep this tab open; we&apos;ll also email you the link.</p>
            </div>
          )}

          {error && <p className="form-error mt-5">{error}</p>}

          {step !== "running" && step !== "platform" && step !== "goal" && (
            <div className="flex items-center gap-3 mt-8">
              <button type="button" onClick={next} className="btn btn-primary btn-lg">
                {step === "email" ? "Analyze my posts" : step === "niche" && !niche ? "Skip" : "OK"}
              </button>
              <span className="caption hidden sm:inline">
                press <b>Enter ↵</b>
              </span>
            </div>
          )}
          {step === "goal" && (
            <button type="button" onClick={() => setStep("email")} className="self-start mt-5 text-[13px] text-ink-3 hover:text-ink">
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
