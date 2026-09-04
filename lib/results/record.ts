import type { Repo } from "@/lib/db/repo";
import type { Campaign, CampaignResult } from "@/lib/db/types";

import { blendLearning, computeCpaCents, computeCtr, computeLift, type ResultInput } from "./compute";

/**
 * The one write path for a campaign result — manual entry and platform sync
 * both land here, so the learnings flywheel turns identically either way.
 */
export async function recordCampaignResult(
  repo: Repo,
  campaign: Campaign,
  input: ResultInput,
  source: "manual" | "meta_api",
): Promise<CampaignResult> {
  const row = await repo.insertCampaignResult({
    campaign_id: campaign.id,
    impressions: input.impressions,
    clicks: input.clicks,
    spend_cents: input.spend_cents,
    bookings: input.bookings,
    revenue_cents: input.revenue_cents,
    ctr: computeCtr(input),
    cpa_cents: computeCpaCents(input),
    source,
  });

  if (source === "manual" && campaign.status === "live") {
    await repo.setCampaignStatus(campaign.id, "complete");
  }

  const business = await repo.getBusiness(campaign.business_id);
  if (business) {
    const angleType = campaign.audience.angle_type ?? "offer";
    const geoBucket = business.country || "US";
    const observed = computeLift(input);
    const existing = (await repo.listLearnings(business.category, geoBucket)).find(
      (l) => l.angle_type === angleType,
    );
    // A seeded prior is illustrative — the first real result REPLACES it
    // rather than blending truth with sample data.
    const blendBase =
      existing && existing.source === "measured"
        ? { lift: Number(existing.lift), sample_size: existing.sample_size }
        : null;
    const blended = blendLearning(blendBase, observed);
    await repo.upsertLearning({
      category: business.category,
      geo_bucket: geoBucket,
      angle_type: angleType,
      lift: blended.lift,
      sample_size: blended.sample_size,
      source: "measured",
    });
  }
  return row;
}
