"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

export async function setOpportunityStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("opportunity_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "accepted" && status !== "dismissed") return;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.setOpportunityStatus(id, status);
  revalidatePath("/app");
  revalidatePath("/app/opportunities");
}

/** Mark a campaign as launched (live). Also flags the opportunity. */
export async function markLaunchedAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaign_id") ?? "");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) return;
  await repo.setCampaignStatus(campaignId, "live");
  await repo.setOpportunityStatus(campaign.opportunity_id, "launched");
  revalidatePath(`/app/campaigns/${campaignId}`);
  revalidatePath("/app");
}
