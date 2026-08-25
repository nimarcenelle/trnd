"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";

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

  const week = weekOf();
  const [opportunities, campaigns] = await Promise.all([
    repo.listOpportunities(business.id, week),
    repo.listCampaigns(business.id),
  ]);
  const withCampaign = new Set(campaigns.map((c) => c.opportunity_id));
  const keepIds = opportunities.filter((o) => withCampaign.has(o.id)).map((o) => o.id);
  await repo.deleteOpportunitiesForWeek(business.id, week, keepIds);
  await recommendForBusiness(repo, business);
  revalidatePath("/app", "layout");
}