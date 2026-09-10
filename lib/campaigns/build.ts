import { generateCampaign } from "@/lib/ai";
import type { Repo } from "@/lib/db/repo";
import type { CreativeKind } from "@/lib/db/types";

export type BuildResult = { campaignId: string } | { error: string };

export interface BuildOptions {
  /** The owner's one-line steer from the pick's Ask box. */
  direction?: string | null;
  /** Rewrite the pick's existing campaign in place instead of returning it.
   * Only a campaign that hasn't launched can be rebuilt. */
  rebuild?: boolean;
}

/** Launched campaigns are the record results point at — never rewritten. */
export function campaignRebuildable(status: string): boolean {
  return status === "draft" || status === "exported";
}

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
  opts: BuildOptions = {},
): Promise<BuildResult> {
  const opportunity = await repo.getOpportunity(opportunityId);
  if (!opportunity) return { error: "That opportunity isn't available anymore." };

  // Idempotent: one campaign per opportunity — unless the owner asked for
  // it rewritten to a direction, and it hasn't launched.
  const existing = await repo.getCampaignByOpportunity(opportunity.id);
  if (existing && !opts.rebuild) return { campaignId: existing.id };
  if (existing && !campaignRebuildable(existing.status)) {
    return { error: "That campaign is already launched — its results are the record. Build the next one instead." };
  }

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
    { business, signal, opportunity, service, services, brief, direction: opts.direction ?? null },
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

  if (existing) {
    await repo.replaceCampaign(
      existing.id,
      {
        angle: angle.angle,
        hook: angle.hook,
        offer: angle.offer,
        audience: angle.audience,
        model_used: generated.model_used,
        prompt_version: generated.prompt_version,
      },
      creatives,
    );
    return { campaignId: existing.id };
  }

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