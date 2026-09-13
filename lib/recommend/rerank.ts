import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";
import { generateWeekPicks } from "@/lib/picks/generate";

import { rankedPicks, recommendForBusiness, weekOf } from "./recommend";
import { writeTopPickReads } from "./read";

/**
 * Rebuild this week's ranking through the full pipeline. Upsert-first so a
 * signal that stays ranked KEEPS its row id — pages already rendered hold
 * opportunity ids, and a build click must not land on a deleted row. Only
 * rows that fell out of the new ranking (and have no campaign) are removed.
 * Used by the owner's re-rank button AND automatically whenever the
 * founding analysis (re)lands.
 *
 * A new ranking means new picks, so the week's picks are rewritten after it
 * unless the caller writes them itself (`picks: false`).
 */
export async function rerankWeek(repo: Repo, business: Business, opts: { picks?: boolean } = {}): Promise<void> {
  const week = weekOf();
  const result = await recommendForBusiness(repo, business);
  const campaigns = await repo.listCampaigns(business.id);
  const keepIds = [...result.opportunityIds, ...campaigns.map((c) => c.opportunity_id)];
  await repo.deleteOpportunitiesForWeek(business.id, week, keepIds);
  // The re-ranked picks get their read now — stale reads (the fingerprint
  // moved with the score) are rewritten, unchanged ones cost nothing.
  // Every pick, same as the weekly job: the pager offers five, and the
  // default of three left picks four and five saying "TRND is writing the
  // read" the moment an owner paged to them.
  const picks = await rankedPicks(repo, business, result.opportunityIds);
  await writeTopPickReads(repo, business, picks, picks.length);
  if (opts.picks === false) return;
  if (result.allHeld) {
    // Everything held: take down last run's picks (a pick someone already ran
    // or dismissed stays, by replace_week_picks' own rule). Generating would
    // stop at the empty ranking and leave them up.
    try {
      await repo.replaceWeekPicks(business.id, week, []);
    } catch (err) {
      console.warn(`[picks] clearing an all-Hold week for ${business.id} failed (non-fatal):`, (err as Error).message);
    }
    return;
  }
  await regenerateWeekPicks(repo, business);
}

/**
 * Rewrite the week's picks without ever throwing and without holding a
 * request open on the model.
 *
 * Several owner actions (the re-rank button, the market scan, the snapshot
 * refresh) await rerankWeek inside the request. Five Pro calls must not sit
 * between a click and its redirect, so inside a request the picks are
 * written after the response. Outside one, `after` throws and the job simply
 * waits for them. The keyless template is fast and runs inline.
 */
export async function regenerateWeekPicks(repo: Repo, business: Business): Promise<void> {
  const run = async () => {
    try {
      const written = await generateWeekPicks(repo, business);
      console.log(`[picks] ${business.id}: ${written.ready} ready, ${written.draft} draft`);
    } catch (err) {
      console.warn(`[picks] regeneration for ${business.id} failed (non-fatal):`, (err as Error).message);
    }
  };
  if (!isGeminiConfigured) return run();
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run();
  }
}
