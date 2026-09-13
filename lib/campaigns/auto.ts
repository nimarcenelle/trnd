import { getPlanState } from "@/lib/billing";
import type { Repo } from "@/lib/db/repo";
import type { Business, Campaign, Opportunity } from "@/lib/db/types";

import { buildCampaignForOpportunity } from "./build";

/** The C band's floor on the 0-10 score (an Opportunity Grade of 50). A Hold
 * is "don't build a campaign yet", so it is never built unasked; the owner
 * can still "Build anyway". */
export const WORTH_RUNNING = 5.0;

/** Builds in flight in this process, by opportunity — a second dashboard
 * load (or the cron landing mid-build) must not write a second campaign. */
const inFlight = new Set<string>();

/**
 * The product is the finished ad, so the week's #1 pick is built without
 * being asked: once by the Monday cron, and self-healed by the dashboard
 * whenever the top pick has no campaign yet. Never builds a thin pick, and
 * never past a locked plan — those stay the owner's call. Returns the
 * campaign when one exists afterwards, null when nothing was (or could be)
 * built. Errors are logged, never thrown: a failed build is a "writing…"
 * state on the next load, not a broken page.
 */
export async function ensureWeekCampaign(
  repo: Repo,
  business: Business,
  top: Opportunity,
): Promise<Campaign | null> {
  const existing = await repo.getCampaignByOpportunity(top.id);
  if (existing) return existing;
  if (Number(top.score) < WORTH_RUNNING || top.status === "dismissed") return null;
  if (top.business_id !== business.id) return null;
  if ((await getPlanState(repo, business)).locked) return null;
  if (inFlight.has(top.id)) return null;
  inFlight.add(top.id);
  try {
    const result = await buildCampaignForOpportunity(repo, top.id);
    if ("error" in result) {
      console.warn(`[campaigns] auto-build skipped for ${top.id}: ${result.error}`);
      return null;
    }
    return await repo.getCampaign(result.campaignId);
  } catch (err) {
    console.warn(`[campaigns] auto-build failed for ${top.id} (non-fatal):`, (err as Error).message);
    return null;
  } finally {
    inFlight.delete(top.id);
  }
}

/** True when the dashboard should show "writing this week's ad" and kick
 * the build off after its response. */
export function shouldAutoBuild(top: Opportunity, hasCampaign: boolean, locked: boolean): boolean {
  return !hasCampaign && !locked && top.status !== "dismissed" && Number(top.score) >= WORTH_RUNNING;
}
