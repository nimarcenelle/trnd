"use server";

import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { answerAsk, type AskAnswer } from "./ask";

export interface AskState {
  question?: string;
  result?: AskAnswer;
  error?: string;
}

export async function askAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const question = String(formData.get("question") ?? "").trim().slice(0, 400);
  if (question.length < 8) return { error: "Ask a full question — a sentence, not a keyword." };
  try {
    return { question, result: await answerAsk(repo, business, question) };
  } catch (err) {
    console.warn("[ask] failed:", (err as Error).message);
    return { question, error: "The analyst hit a snag — try again in a moment." };
  }
}
