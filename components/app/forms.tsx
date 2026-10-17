"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { IconPlus } from "@/components/icons";
import { addRivalAction, createBrandAction, type FormState } from "@/lib/actions";
import { GOALS } from "@/lib/goals";

import SubmitButton from "./submit-button";

/** What the read is doing, by the second it usually reaches that part. One model call does all of it, so this is a clock, not a signal. */
const READ_STEPS: { at: number; label: (site: string) => string }[] = [
  { at: 0, label: (site) => `Reading ${site}` },
  { at: 6, label: () => "Working out what you sell, to whom, and at what price" },
  { at: 18, label: () => "Naming the brands competing for the same customers" },
  { at: 38, label: () => "Ranking them by how directly they compete" },
];

/** Where the answers given during the read wait for the brand to exist. Read by OnboardingCarry on the next step. */
export const ONBOARDING_KEY = "trnd.onboarding";
export interface OnboardingAnswers {
  goal?: string;
  monthly_budget?: string;
  target_cost?: string;
  focus?: string;
}

/**
 * The minute the site read takes, put to use: a welcome and the four
 * questions every recommendation is judged against. Answers are kept in the
 * browser as they are typed (the brand does not exist yet) and saved to it
 * on the next step.
 */
function Questions() {
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(ONBOARDING_KEY) ?? "{}") as OnboardingAnswers;
    } catch {
      return {};
    }
  });
  const set = (k: keyof OnboardingAnswers, v: string) => {
    const next = { ...answers, [k]: v };
    setAnswers(next);
    try {
      sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the questions are asked again on the briefing */
    }
  };
  return (
    <div className="card mt-4 p-5">
      <h2 className="text-[16px] font-semibold">Welcome. While we read your site, two things that shape every recommendation.</h2>
      <p className="text-[13px] text-ink-2 mt-1">Skip anything you are not sure of. You can change it any time under Business DNA.</p>
      <fieldset className="border-0 p-0 m-0 mt-4">
        <legend className="text-[13px] font-medium mb-2">What are you trying to do right now?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {GOALS.map((g) => (
            <label key={g.value} className="relative cursor-pointer">
              <input type="radio" name="onboarding_goal" value={g.value} checked={answers.goal === g.value} onChange={() => set("goal", g.value)} className="peer sr-only" />
              <span className="block h-full rounded-lg border border-line-strong px-3 py-2.5 transition-colors peer-checked:border-ink peer-checked:bg-subtle peer-checked:shadow-[0_0_0_1px_var(--ink)] hover:bg-subtle">
                <span className="block text-[13px] font-semibold">{g.label}</span>
                <span className="block text-[12px] text-ink-3 mt-0.5">{g.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3 mt-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Monthly ad budget</span>
          <input className="input" value={answers.monthly_budget ?? ""} onChange={(e) => set("monthly_budget", e.target.value)} placeholder="$15,000" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Target cost per sale</span>
          <input className="input" value={answers.target_cost ?? ""} onChange={(e) => set("target_cost", e.target.value)} placeholder="$35 CPA" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Product or offer to focus on</span>
          <input className="input" value={answers.focus ?? ""} onChange={(e) => set("focus", e.target.value)} placeholder="The refill subscription" />
        </label>
      </div>
    </div>
  );
}

/** Shown while the site is read and the rivals named: about a minute, narrated so it reads as progress. */
function Reading() {
  const { pending, data } = useFormStatus();
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!pending) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (!pending) return null;
  const site = String(data?.get("url") ?? "").replace(/^https?:\/\//, "") || "your site";
  const current = READ_STEPS.filter((s) => s.at <= seconds).length - 1;
  return (
    <>
    <div className="card mt-4 p-4">
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13.5px]">
        {READ_STEPS.map((step, i) => (
          <li key={step.at} className={`flex items-center gap-2.5 ${i > current ? "text-ink-3" : ""}`}>
            {i < current ? (
              <span className="w-3.5 h-3.5 rounded-full bg-ink text-bg grid place-items-center text-[9px]">✓</span>
            ) : i === current ? (
              <span className="spinner" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-line-strong" />
            )}
            {step.label(site)}
          </li>
        ))}
      </ul>
      <p className="caption mt-3">About a minute. Then you confirm the list and the first read of their ads starts.</p>
    </div>
    <Questions />
    </>
  );
}

export function UrlForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createBrandAction, {});
  return (
    <form action={action}>
      <div className="sitebox">
        <input name="url" defaultValue={defaultUrl?.replace(/^https?:\/\//, "")} placeholder="yourbrand.com" aria-label="Your website" required />
        <SubmitButton className="btn btn-primary" pending="Reading…">
          Continue
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-3">{state.error}</p>}
      <Reading />
    </form>
  );
}

export function AddRivalForm() {
  const [state, action] = useActionState<FormState, FormData>(addRivalAction, {});
  return (
    <form action={action}>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className="input flex-1" name="name" placeholder="Competitor name, as on Facebook" required />
        <input className="input sm:w-[200px]" name="website" placeholder="Website (optional)" />
        <SubmitButton className="btn btn-secondary" pending="Adding…">
          <IconPlus /> Add
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-2 mb-0">{state.error}</p>}
    </form>
  );
}
