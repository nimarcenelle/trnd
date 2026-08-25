import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";

import { recommendForBusiness, weekOf } from "./recommend";

/**
 * Rebuild this week's ranking through the full pipeline. Opportunities a
 * campaign already references survive. Used by the owner's re-rank button
 * AND automatically whenever the founding analysis (re)lands — the first
 * ranking often runs before the brief exists, and must not stand unjudged
 * for a week.
 */
export async function rerankWeek(repo: Repo, business: Business): Promise<void> {
  const week = weekOf();
  const [opportunities, campaigns] = await Promise.all([
    repo.listOpportunities(business.id, week),
    repo.listCampaigns(business.id),
  ]);
  const withCampaign = new Set(campaigns.map((c) => c.opportunity_id));
  const keepIds = opportunities.filter((o) => withCampaign.has(o.id)).map((o) => o.id);
  await repo.deleteOpportunitiesForWeek(business.id, week, keepIds);
  await recommendForBusiness(repo, business);
}