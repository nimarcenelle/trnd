"use client";

import { useActionState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { updateObjectivesAction, type FormState } from "@/lib/actions";
import { GOALS } from "@/lib/goals";

import { ONBOARDING_KEY, type OnboardingAnswers } from "./forms";

const noop = () => () => {};
const readStored = () => {
  try {
    return sessionStorage.getItem(ONBOARDING_KEY);
  } catch {
    return null;
  }
};

/**
 * On the confirm step: the answers given while the site was read are
 * posted to the brand, once, without a click, and shown back in one line.
 * Nothing stored means nothing happens.
 */
export default function OnboardingCarry({ hasObjectives }: { hasObjectives: boolean }) {
  const [state, action] = useActionState<FormState & { saved?: boolean }, FormData>(updateObjectivesAction, {});
  const raw = useSyncExternalStore(noop, readStored, () => null);
  const stored = useMemo((): OnboardingAnswers | null => {
    try {
      return raw ? (JSON.parse(raw) as OnboardingAnswers) : null;
    } catch {
      return null;
    }
  }, [raw]);
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<OnboardingAnswers | null>(null);
  useEffect(() => {
    if (hasObjectives || !stored?.goal || submitted.current) return;
    submitted.current = stored;
    form.current?.requestSubmit();
  }, [hasObjectives, stored]);
  useEffect(() => {
    if (!state.saved) return;
    try {
      sessionStorage.removeItem(ONBOARDING_KEY);
    } catch {
      /* fine */
    }
  }, [state.saved]);
  const answers = submitted.current ?? stored;
  if (hasObjectives || !answers?.goal) return null;
  const goal = GOALS.find((g) => g.value === answers.goal)?.label ?? answers.goal;
  const parts = [goal, answers.monthly_budget, answers.target_cost, answers.focus].filter(Boolean);
  return (
    <form ref={form} action={action} className="well px-4 py-3 mt-4 text-[13px] text-ink-2 leading-[1.6]">
      <input type="hidden" name="goal" value={answers.goal} />
      <input type="hidden" name="monthly_budget" value={answers.monthly_budget ?? ""} />
      <input type="hidden" name="target_cost" value={answers.target_cost ?? ""} />
      <input type="hidden" name="focus" value={answers.focus ?? ""} />
      <input type="hidden" name="notes" value="" />
      <span className="font-medium text-ink">Your goals{state.saved ? ", saved" : ""}: </span>
      {parts.join(" · ")}
      {state.error && <span className="form-error !m-0 ml-2">{state.error}</span>}
    </form>
  );
}
