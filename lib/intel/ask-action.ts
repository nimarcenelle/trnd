"use server";

import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { answerAsk, answerPickAsk, type AskAnswer } from "./ask";

export interface AskExchange {
  question: string;
  result: AskAnswer;
}

/** The whole conversation lives in the action state — each ask replays the
 * prior turns to the model, so follow-ups keep their thread. */
export interface AskState {
  turns: AskExchange[];
  error?: string;
}

export async function askAction(prev: AskState, formData: FormData): Promise<AskState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const turns = prev.turns ?? [];
  const question = String(formData.get("question") ?? "").trim().slice(0, 400);
  if (question.length < 8) return { turns, error: "Ask a full question — a sentence, not a keyword." };
  try {
    const history = turns.map((t) => ({ question: t.question, answer: t.result.answer }));
    const result = await answerAsk(repo, business, question, history);
    return { turns: [...turns, { question, result }] };
  } catch (err) {
    console.warn("[ask] failed:", (err as Error).message);
    return { turns, error: "The analyst hit a snag — try again in a moment." };
  }
}

/**
 * The pick's own Ask box. Same thread semantics as the page-level ask; the
 * opportunity id is only a reference — ownership is re-checked through the
 * user's repo, never trusted from the form.
 */
export async function askPickAction(prev: AskState, formData: FormData): Promise<AskState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const turns = prev.turns ?? [];
  const question = String(formData.get("question") ?? "").trim().slice(0, 400);
  if (question.length < 8) return { turns, error: "Ask a full question — a sentence, not a keyword." };
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const opportunity = opportunityId ? await repo.getOpportunity(opportunityId) : null;
  if (!opportunity || opportunity.business_id !== business.id) {
    return { turns, error: "The ranking just updated — refresh and ask again." };
  }
  try {
    const history = turns.map((t) => ({ question: t.question, answer: t.result.answer }));
    const result = await answerPickAsk(repo, business, opportunity, question, history);
    return { turns: [...turns, { question, result }] };
  } catch (err) {
    console.warn("[ask] pick ask failed:", (err as Error).message);
    return { turns, error: "The analyst hit a snag — try again in a moment." };
  }
}
