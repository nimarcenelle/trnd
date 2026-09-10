import { generateCampaign } from "@/lib/ai";
import type { Repo } from "@/lib/db/repo";
import type { CreativeKind } from "@/lib/db/types";

export type BuildResult = { campaignId: string } | { error: string };

/**
 * "Build the campaign" — generate angle + assets (Gemini or deterministic
 * fallback), persist campaign + creatives, mark the opportunity accepted.
 * `onStatus` narrates the stages so the ~minute of generation reads as
 * progress, not a frozen button.
 */
export async function buildCampaignForOpportunity(
  repo: Repo,
  opportunityId: string,
  onStatus: (label: string) => void = () => {},
): Promise<BuildResult> {
  const opportunity = await repo.getOpportunity(opportunityId);
  if (!opportunity) return { error: "That opportunity isn't available anymore." };

  // Idempotent: one campaign per opportunity.
  const existing = await repo.getCampaignByOpportunity(opportunity.id);
  if (existing) return { campaignId: existing.id };

  onStatus("Reading the signal…");
  const [business, signal, services, brief] = await Promise.all([
    repo.getBusiness(opportunity.business_id),
    repo.getSignal(opportunity.signal_id),
    repo.listServices(opportunity.business_id),
    repo.getBusinessBrief(opportunity.business_id),
  ]);
  if (!business || !signal) return { error: "The signal behind this opportunity is gone." };

  const service = services.find((s) => s.id === opportunity.matched_service_id) ?? null;
  const generated = await generateCampaign(
    { business, signal, opportunity, service, services, brief },
    onStatus,
  );
  const { angle, assets } = generated.result;

  onStatus("Saving your campaign…");
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
  return { campaignId: campaign.id };
}