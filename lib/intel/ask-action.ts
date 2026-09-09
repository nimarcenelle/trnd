"use server";

import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { answerAsk, type AskAnswer } from "./ask";

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
