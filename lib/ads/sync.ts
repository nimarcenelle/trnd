import type { Repo } from "@/lib/db/repo";
import { isMetaAdsConfigured } from "@/lib/env";
import { recordCampaignResult } from "@/lib/results/record";

import { fetchCampaignInsights } from "./meta";

/**
 * The closed loop: for every business with a connected Meta account, pull
 * lifetime insights for each launched campaign and record them through the
 * same write path as manual entry — so CTR, ROAS, and the learnings
 * flywheel update without the owner typing a number.
 */

export interface SyncSummary {
  businessId: string;
  campaignsSynced: number;
  errors: number;
}

export async function runResultsSync(repo: Repo): Promise<SyncSummary[]> {
  if (!isMetaAdsConfigured) return [];
  const out: SyncSummary[] = [];
  for (const business of await repo.listAllBusinesses()) {
    const summary: SyncSummary = { businessId: business.id, campaignsSynced: 0, errors: 0 };
    try {
      const connection = await repo.getConnection(business.id, "meta");
      if (!connection || connection.status !== "connected") {
        out.push(summary);
        continue;
      }
      const campaigns = (await repo.listCampaigns(business.id)).filter((c) => c.external_id);
      for (const campaign of campaigns) {
        try {
          const read = await fetchCampaignInsights(connection.access_token, campaign.external_id!);
          if (!read) continue;
          await repo.setCampaignExternal(campaign.id, campaign.external_id!, read.status);
          // Platform reports ACTIVE → our status reflects it.
          if (read.status === "ACTIVE" && campaign.status !== "live") {
            await repo.setCampaignStatus(campaign.id, "live");
          }
          await recordCampaignResult(repo, campaign, read.row, "meta_api");
          summary.campaignsSynced += 1;
        } catch (err) {
          summary.errors += 1;
          console.warn(`[ads:sync] campaign ${campaign.id} failed:`, (err as Error).message);
        }
      }
      // An expired token must surface in Settings, not fail silently forever.
      if (
        connection.token_expires_at &&
        new Date(connection.token_expires_at).getTime() < Date.now()
      ) {
        await repo.upsertConnection({ ...connection, status: "error" });
      }
    } catch (err) {
      summary.errors += 1;
      console.warn(`[ads:sync] business ${business.id} failed:`, (err as Error).message);
    }
    out.push(summary);
  }
  return out;
}
