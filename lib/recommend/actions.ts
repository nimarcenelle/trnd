"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
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

  // The re-rank writes shared tables RLS keeps read-only for user sessions;
  // ownership is established above, the job runs on the service repo.
  await rerankWeek(getAdminRepo(), business);
  revalidatePath("/app", "layout");
}