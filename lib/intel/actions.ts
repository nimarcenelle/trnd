"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { launchPausedCampaign } from "@/lib/ads/meta";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { isMetaAdsConfigured } from "@/lib/env";
import { runIntelIngestForBusiness } from "@/lib/intel/ingest";
import { budgetFor } from "@/lib/recommend/insights";

/** Add a named competitor and read it in the background right away. */
export async function addCompetitorAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const website = String(formData.get("website") ?? "").trim().slice(0, 200) || null;
  if (!name) return;
  await repo.createCompetitor({ business_id: business.id, name, website, place_id: null });
  after(async () => {
    try {
      await runIntelIngestForBusiness(repo, business);
    } catch (err) {
      console.warn("[intel] first competitor read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
}

export async function deleteCompetitorAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.deleteCompetitor(String(formData.get("competitor_id") ?? ""));
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
}

export async function markAlertsReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return;
  await repo.markAlertsRead(business.id);
  revalidatePath("/app");
}

export async function disconnectMetaAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return;
  await repo.deleteConnection(business.id, "meta");
  revalidatePath("/app/settings");
}

export interface LaunchState {
  error?: string;
  ok?: boolean;
}

/**
 * Push a built campaign into the connected Meta account — campaign + ad set,
 * both PAUSED, budget from the price band. Nothing spends until the owner
 * flips it on in Ads Manager; from then on the daily sync pulls its results.
 */
export async function launchToMetaAction(
  _prev: LaunchState,
  formData: FormData,
): Promise<LaunchState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  if (!isMetaAdsConfigured) return { error: "Meta app credentials aren't configured yet." };

  const campaign = await repo.getCampaign(String(formData.get("campaign_id") ?? ""));
  if (!campaign || campaign.business_id !== business.id) return { error: "Campaign not found." };
  if (campaign.external_id) return { ok: true };

  const connection = await repo.getConnection(business.id, "meta");
  if (!connection || connection.status !== "connected" || !connection.account_id) {
    return { error: "Connect your Meta ad account in Settings first." };
  }

  // Daily budget: the low end of the price-band guidance, in cents.
  const daily = budgetFor(business.price_band).daily.match(/\d+/)?.[0] ?? "25";
  try {
    const { externalId } = await launchPausedCampaign(
      connection.access_token,
      connection.account_id,
      business,
      campaign,
      Number(daily) * 100,
    );
    await repo.setCampaignExternal(campaign.id, externalId, "PAUSED");
    await repo.setCampaignStatus(campaign.id, "exported");
  } catch (err) {
    console.warn("[ads] launch failed:", (err as Error).message);
    return { error: "Meta rejected the launch — check the ad account's permissions and try again." };
  }
  revalidatePath(`/app/campaigns/${campaign.id}`);
  return { ok: true };
}
