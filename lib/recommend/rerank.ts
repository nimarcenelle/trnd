import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";

import { recommendForBusiness, weekOf } from "./recommend";

/**
 * Rebuild this week's ranking through the full pipeline. Upsert-first so a
 * signal that stays ranked KEEPS its row id — pages already rendered hold
 * opportunity ids, and a build click must not land on a deleted row. Only
 * rows that fell out of the new ranking (and have no campaign) are removed.
 * Used by the owner's re-rank button AND automatically whenever the
 * founding analysis (re)lands.
 */
export async function rerankWeek(repo: Repo, business: Business): Promise<void> {
  const week = weekOf();
  const result = await recommendForBusiness(repo, business);
  const campaigns = await repo.listCampaigns(business.id);
  const keepIds = [...result.opportunityIds, ...campaigns.map((c) => c.opportunity_id)];
  await repo.deleteOpportunitiesForWeek(business.id, week, keepIds);
}