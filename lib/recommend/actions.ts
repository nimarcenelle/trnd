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

/**
 * Owner-triggered market scan for the empty-week dead end: the analysis
 * landed but no ranking did (day-one ingest hiccuped, or the daily cron
 * hasn't come around yet). Runs the same reads onboarding runs — the
 * business's own watch terms through the targeted adapters — then
 * re-ranks, so "check back soon" becomes a button.
 */
export async function scanMarketNowAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  try {
    const jobRepo = getAdminRepo();
    const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
    await runSignalIngestForBusiness(jobRepo, business);
    await rerankWeek(jobRepo, business);
  } catch (err) {
    console.warn("[recommend] owner-triggered scan failed (non-fatal):", (err as Error).message);
  }
  revalidatePath("/app", "layout");
}
