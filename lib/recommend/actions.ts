"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { rerankWeek } from "@/lib/recommend/rerank";

/**
 * Owner-triggered re-rank of the current week: fresh signals came in, the
 * snapshot changed, or the ranking just feels stale. Opportunities a
 * campaign already references survive; everything else is re-scored from
 * today's signal pool through the full pipeline (relevance pass included).
 */
export async function refreshRankingAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  await rerankWeek(repo, business);
  revalidatePath("/app", "layout");
}