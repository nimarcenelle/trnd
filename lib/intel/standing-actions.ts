"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { answerStandingQuestions, MAX_STANDING_QUESTIONS } from "./standing";

/** Add a standing question and answer it now, so the owner sees the first
 * answer on the spot instead of next Monday. */
export async function addStandingQuestionAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const question = String(formData.get("question") ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (question.length < 8) return;
  const existing = await repo.listStandingQuestions(business.id, { activeOnly: true });
  if (existing.length >= MAX_STANDING_QUESTIONS) return;
  if (existing.some((q) => q.question.toLowerCase() === question.toLowerCase())) return;
  const created = await repo.createStandingQuestion({ business_id: business.id, question });
  try {
    await answerStandingQuestions(repo, business, { only: [created.id] });
  } catch (err) {
    console.warn("[standing] first answer failed (non-fatal):", (err as Error).message);
  }
  revalidatePath("/app");
}

export async function removeStandingQuestionAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const id = String(formData.get("id") ?? "");
  if (id) await repo.setStandingQuestionActive(id, false);
  revalidatePath("/app");
}
