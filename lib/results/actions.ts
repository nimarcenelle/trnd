"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { recordCampaignResult } from "./record";

export interface ResultFormState {
  error?: string;
  ok?: boolean;
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").replace(/[^0-9.]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Manual result entry — the MVP end of the flywheel. Computes CTR/CPA,
 * stores the row, marks the campaign complete, and blends the observation
 * into `learnings` so next week's scoring actually gets sharper.
 */
export async function submitResultAction(
  _prev: ResultFormState,
  formData: FormData,
): Promise<ResultFormState> {
  const campaignId = String(formData.get("campaign_id") ?? "");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) return { error: "Campaign not found." };

  const input = {
    impressions: num(formData, "impressions"),
    clicks: num(formData, "clicks"),
    spend_cents: num(formData, "spend") !== null ? Math.round(num(formData, "spend")! * 100) : null,
    bookings: num(formData, "bookings"),
    revenue_cents:
      num(formData, "revenue") !== null ? Math.round(num(formData, "revenue")! * 100) : null,
  };
  if (Object.values(input).every((v) => v === null)) {
    return { error: "Enter at least one number." };
  }

  // One shared write path with platform sync — result row, status,
  // learnings flywheel.
  await recordCampaignResult(repo, campaign, input, "manual");

  revalidatePath("/app/results");
  revalidatePath(`/app/campaigns/${campaignId}`);
  revalidatePath("/app");
  return { ok: true };
}
