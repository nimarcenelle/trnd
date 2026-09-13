import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { weekOf } from "@/lib/recommend/week";

import { generateWeekPicks } from "./generate";

/**
 * The weekly pick job, sized to a cron invocation.
 *
 * Writing one brand's week is five model calls with retries: a dry run on
 * eskiin took a minute on a good day and two and a half when Pro failed
 * validation and Flash took over. One Vercel function gets 300 seconds, and
 * production holds a dozen brands, so a single loop over everyone would write
 * two or three weeks and silently leave the rest with an empty list.
 *
 * So each invocation starts brands only while its time budget lasts, and the
 * route hands whatever is left to a fresh invocation. A brand whose week
 * already holds picks of any status is skipped: counting drafts, not just
 * ready picks, is what stops a week that validated badly from being retried
 * on every hop until the chain never ends.
 */

export interface PicksJobResult {
  written: { businessId: string; ready: number; draft: number }[];
  /** Weeks already written, or with nothing ranked to write from. */
  skipped: number;
  /** Brands still waiting when the budget ran out. */
  remaining: number;
}

/** Longest a started brand can take (about 150s) still fits in 300s. */
export const PICKS_JOB_BUDGET_MS = 120_000;

export async function runPicksJob(
  repo: Repo,
  opts: {
    budgetMs?: number;
    now?: () => number;
    generate?: (repo: Repo, business: Business) => Promise<{ ready: number; draft: number }>;
  } = {},
): Promise<PicksJobResult> {
  const budget = opts.budgetMs ?? PICKS_JOB_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const generate = opts.generate ?? ((r: Repo, b: Business) => generateWeekPicks(r, b));
  const started = now();
  const week = weekOf();
  const result: PicksJobResult = { written: [], skipped: 0, remaining: 0 };

  for (const business of await repo.listAllBusinesses()) {
    try {
      if ((await repo.countWeekPicks(business.id, week)) > 0) {
        result.skipped += 1;
        continue;
      }
      if ((await repo.listOpportunities(business.id, week)).length === 0) {
        result.skipped += 1;
        continue;
      }
    } catch (err) {
      console.warn(`[picks:job] could not read ${business.id}:`, (err as Error).message);
      result.skipped += 1;
      continue;
    }
    // Checked before starting, never mid-brand: a half-written week is worse
    // than one that waits for the next hop.
    if (now() - started > budget) {
      result.remaining += 1;
      continue;
    }
    try {
      const out = await generate(repo, business);
      result.written.push({ businessId: business.id, ready: out.ready, draft: out.draft });
    } catch (err) {
      console.warn(`[picks:job] ${business.id} failed:`, (err as Error).message);
      result.written.push({ businessId: business.id, ready: 0, draft: 0 });
    }
  }
  return result;
}
