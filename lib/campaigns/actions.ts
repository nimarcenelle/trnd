"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateCampaign } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { CreativeKind } from "@/lib/db/types";

/**
 * "Build the campaign" — the one primary action. Generates angle + assets
 * (Gemini or deterministic fallback), persists campaign + creatives, marks
 * the opportunity accepted, and lands on the campaign screen.
 */
export async function buildCampaignAction(formData: FormData): Promise<void> {
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);

  const opportunity = await repo.getOpportunity(opportunityId);
  if (!opportunity) redirect("/app");

  // Idempotent: one campaign per opportunity.
  const existing = await repo.getCampaignByOpportunity(opportunity.id);
  if (existing) redirect(`/app/campaigns/${existing.id}`);

  const [business, signal, services, brief] = await Promise.all([
    repo.getBusiness(opportunity.business_id),
    repo.getSignal(opportunity.signal_id),
    repo.listServices(opportunity.business_id),
    repo.getBusinessBrief(opportunity.business_id),
  ]);
  if (!business || !signal) redirect("/app");

  const service = services.find((s) => s.id === opportunity.matched_service_id) ?? null;
  const generated = await generateCampaign({ business, signal, opportunity, service, brief });
  const { angle } = generated.result;
  const { assets } = generated.result;

  const creatives: { kind: CreativeKind; content: string; variant_index: number }[] = [
    ...assets.headlines.map((c, i) => ({ kind: "headline" as const, content: c, variant_index: i })),
    ...assets.primary_texts.map((c, i) => ({ kind: "primary_text" as const, content: c, variant_index: i })),
    ...assets.scripts.map((c, i) => ({ kind: "script" as const, content: c, variant_index: i })),
    ...assets.static_briefs.map((c, i) => ({ kind: "static_brief" as const, content: c, variant_index: i })),
    { kind: "landing_copy" as const, content: assets.landing_copy, variant_index: 0 },
  ];

  const campaign = await repo.createCampaign(
    {
      opportunity_id: opportunity.id,
      business_id: business.id,
      angle: angle.angle,
      hook: angle.hook,
      offer: angle.offer,
      audience: angle.audience,
      channel: "meta",
      model_used: generated.model_used,
      prompt_version: generated.prompt_version,
    },
    creatives,
  );

  await repo.setOpportunityStatus(opportunity.id, "accepted");
  redirect(`/app/campaigns/${campaign.id}`);
}

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
