"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { blendLearning, computeCpaCents, computeCtr, computeLift } from "./compute";

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

  await repo.insertCampaignResult({
    campaign_id: campaign.id,
    impressions: input.impressions,
    clicks: input.clicks,
    spend_cents: input.spend_cents,
    bookings: input.bookings,
    revenue_cents: input.revenue_cents,
    ctr: computeCtr(input),
    cpa_cents: computeCpaCents(input),
    source: "manual",
  });

  if (campaign.status === "live") {
    await repo.setCampaignStatus(campaign.id, "complete");
  }

  // ---- learnings write-back (the flywheel) ----
  const business = await repo.getBusiness(campaign.business_id);
  if (business) {
    const angleType = campaign.audience.angle_type ?? "offer";
    const geoBucket = business.country || "US";
    const observed = computeLift(input);
    const existing = (await repo.listLearnings(business.category, geoBucket)).find(
      (l) => l.angle_type === angleType,
    );
    const blended = blendLearning(
      existing ? { lift: Number(existing.lift), sample_size: existing.sample_size } : null,
      observed,
    );
    await repo.upsertLearning({
      category: business.category,
      geo_bucket: geoBucket,
      angle_type: angleType,
      lift: blended.lift,
      sample_size: blended.sample_size,
    });
  }

  revalidatePath("/app/results");
  revalidatePath("/app");
  return { ok: true };
}
