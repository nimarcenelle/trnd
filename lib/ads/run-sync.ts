import type { Repo } from "@/lib/db/repo";
import type { BrandPick, Campaign, PickRun, PickRunStatus } from "@/lib/db/types";
import { runAdHistoryRow, runCampaignName, type RunResults } from "@/lib/picks/list";
import { runLift } from "@/lib/record/calibration";

import type { MetaInsightsRow } from "./meta";

/**
 * The connected account's numbers, written onto the creative test they
 * belong to.
 *
 * Results used to enter the system only when an owner typed them on
 * Campaigns. The daily Meta sync already pulled every launched campaign's
 * insights into campaign_results; nothing carried them the last step to the
 * pick run, so a brand that connected its account still had a track record
 * of "completed without numbers" and a Brand signal that stayed dark. This
 * is that step: the run matched to the platform campaign gets the numbers,
 * goes live when the platform says the campaign is delivering, closes when
 * the platform says it ended, and on closing lands in the brand's own ad
 * history with its lift over the account logged, exactly as a hand-entered
 * result would.
 *
 * What it never does: give a verdict (the numbers decide, or the owner
 * does), touch a run the owner stopped, or reopen one that ended.
 */

/** Platform statuses that mean the campaign is delivering. */
export const LIVE_STATUSES = new Set(["ACTIVE"]);
/** Platform statuses that mean the campaign is over. PAUSED is not one of
 * them: an owner pauses to think, and a paused test is still theirs to end. */
export const ENDED_STATUSES = new Set(["COMPLETED", "ARCHIVED", "DELETED"]);

export function resultsFromInsights(row: MetaInsightsRow): RunResults {
  const money = (cents: number | null) => (cents === null ? null : Math.round(cents) / 100);
  return {
    spend_usd: money(row.spend_cents),
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.bookings,
    revenue_usd: money(row.revenue_cents),
  };
}

const delivered = (r: RunResults) => (r.impressions ?? 0) > 0 || (r.clicks ?? 0) > 0 || (r.spend_usd ?? 0) > 0;

/**
 * The run a platform campaign belongs to: by the platform id the run was
 * launched with, else by the opportunity both were built from. Runs the
 * owner stopped are never matched; an ended run is matched only when it
 * carries the platform id, so late-reporting purchases still land on it.
 */
export function matchRun(
  runs: { run: PickRun; pick: BrandPick }[],
  campaign: Pick<Campaign, "external_id" | "opportunity_id">,
): { run: PickRun; pick: BrandPick } | null {
  const open = (r: PickRun) => r.status === "planned" || r.status === "running";
  const byId = campaign.external_id ? runs.filter(({ run }) => run.meta_campaign_id === campaign.external_id && run.status !== "killed") : [];
  const idMatch = byId.find(({ run }) => open(run)) ?? byId[0];
  if (idMatch) return idMatch;
  return runs.find(({ run, pick }) => open(run) && pick.opportunity_id !== null && pick.opportunity_id === campaign.opportunity_id) ?? null;
}

export interface RunSyncResult {
  runId: string;
  status: PickRunStatus;
  /** True when this sync closed the run and wrote its ad-history row. */
  closed: boolean;
}

export async function syncPickRunFromCampaign(
  repo: Repo,
  campaign: Campaign,
  read: { row: MetaInsightsRow; status: string },
  now = new Date(),
): Promise<RunSyncResult | null> {
  const runs = await repo.listPickRuns(campaign.business_id);
  const match = matchRun(runs, campaign);
  if (!match) return null;
  const { run, pick } = match;
  const results = resultsFromInsights(read.row);

  let status: PickRunStatus = run.status;
  const patch: Parameters<Repo["updatePickRun"]>[1] = { ...results };
  if (status === "planned" && (LIVE_STATUSES.has(read.status) || delivered(results))) {
    status = "running";
    patch.launched_at = now.toISOString();
  }
  const closing = status === "running" && ENDED_STATUSES.has(read.status);
  if (closing) {
    status = "completed";
    patch.ended_at = now.toISOString();
  }
  patch.status = status;
  if (!run.meta_campaign_id && campaign.external_id) patch.meta_campaign_id = campaign.external_id;

  // The lift is logged when the run ends, and again on a later sync of an
  // ended run: purchases report late, and the log should carry the final
  // numbers, not the day-one ones.
  const ended = status === "completed" || status === "killed";
  if (ended) {
    const history = await repo.listAdHistory(campaign.business_id).catch(() => []);
    const cal = runLift(results, history, runCampaignName(pick));
    patch.baseline_ctr = cal.baselineCtr;
    patch.lift = cal.lift;
  }
  await repo.updatePickRun(run.id, patch);

  // The ad-history row is written once, when the run closes: the table is
  // write-once per (campaign, ad, start), so a row written mid-flight would
  // freeze day-one numbers as the brand's record of this test.
  if (closing) {
    try {
      const detail = await repo.getPickDetail(pick.id);
      const row = detail ? runAdHistoryRow({ pick: detail.pick, scripts: detail.scripts, run, results, endedAt: now, source: "meta_api" }) : null;
      if (row) await repo.upsertAdHistory([row]);
    } catch (err) {
      console.warn("[ads:sync] run results to ad history failed (non-fatal):", (err as Error).message);
    }
  }
  return { runId: run.id, status, closed: closing };
}
