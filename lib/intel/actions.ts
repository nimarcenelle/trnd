"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { launchPausedCampaign } from "@/lib/ads/meta";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import type { SocialHandles } from "@/lib/db/types";
import { isMetaAdsConfigured } from "@/lib/env";
import { cleanSocialHandles, SOCIAL_PLATFORMS } from "@/lib/import/social-links";
import { normalizeHandle } from "@/lib/social";
import { enrichCompetitor } from "@/lib/intel/direct";
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
  const competitor = await repo.createCompetitor({ business_id: business.id, name, website, place_id: null });
  after(async () => {
    const jobRepo = getAdminRepo();
    // Read their site first, so the first intel read already knows their
    // handles and how directly they compete. enrichCompetitor never throws.
    await enrichCompetitor(jobRepo, business, competitor);
    try {
      await runIntelIngestForBusiness(jobRepo, business);
    } catch (err) {
      console.warn("[intel] first competitor read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
}

/** Find the nearest same-category rivals and start watching them. */
export async function seedCompetitorsAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
  let created = 0;
  try {
    created = (await seedCompetitors(repo, business)).created.length;
  } catch (err) {
    console.warn("[intel] rival discovery failed:", (err as Error).message);
  }
  if (created > 0) {
    after(async () => {
      try {
        await runIntelIngestForBusiness(getAdminRepo(), business);
      } catch (err) {
        console.warn("[intel] first rival read failed (non-fatal):", (err as Error).message);
      }
    });
  }
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
  revalidatePath("/app");
}

export async function deleteCompetitorAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  await repo.deleteCompetitor(String(formData.get("competitor_id") ?? ""));
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
}

/** The three handle inputs, as pasted (URL or @handle), cut to what we
 * store. A blank input clears that platform. */
function handlesFromForm(formData: FormData): SocialHandles {
  const raw: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    raw[platform] = normalizeHandle(platform, String(formData.get(platform) ?? "").slice(0, 300));
  }
  return cleanSocialHandles(raw);
}

/** Set a rival's Instagram, TikTok and Facebook by hand, for the rivals
 * whose site doesn't link them, then read their posts in the background. */
export async function updateCompetitorHandlesAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const id = String(formData.get("competitor_id") ?? "");
  const competitor = (await repo.listCompetitors(business.id)).find((c) => c.id === id);
  if (!competitor) return;
  await repo.updateCompetitor(competitor.id, { social_handles: handlesFromForm(formData) });
  after(async () => {
    try {
      await runIntelIngestForBusiness(getAdminRepo(), business);
    } catch (err) {
      console.warn("[intel] rival accounts read failed (non-fatal):", (err as Error).message);
    }
  });
  revalidatePath("/app/settings");
  revalidatePath("/app/report");
  revalidatePath("/app");
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
