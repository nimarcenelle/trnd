import { generateBusinessBrief, businessJustOnboarded } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { weekOf } from "@/lib/recommend/week";

import { generateWeekPicks } from "./generate";

/**
 * A brand's week, advanced one stage at a time.
 *
 * Writing a week is a chain: the analysis, a first market scan for a fresh
 * signup, the read of its own accounts and its rivals, the ranking, then the
 * five picks. Together that is five to eight minutes of model calls and
 * scrapes. It used to run inside a page request's after()
 * hook and inside the onboarding action, where the platform kills the
 * function at its time limit, so the ranking landed and the picks never did,
 * and the page, whose only memory of the job was a per-instance map, waited
 * out its refreshes and printed "No picks this week" over a week that was
 * simply never written.
 *
 * Now each stage is one invocation of /api/jobs/week, with the route's full
 * time budget, and every stage is idempotent: it reads the database to see
 * what the week still needs, does that one thing, and says what comes next.
 * The page and onboarding only ask for the next stage; they never run it.
 */

export type WeekStage = "brief" | "scan" | "intel" | "rank" | "picks" | "done";

export interface StageDeps {
  brief?: (repo: Repo, business: Business) => Promise<void>;
  scan?: (repo: Repo, business: Business) => Promise<void>;
  intel?: (repo: Repo, business: Business) => Promise<void>;
  rank?: (repo: Repo, business: Business) => Promise<void>;
  picks?: (repo: Repo, business: Business) => Promise<void>;
}

/** What the week still needs, read from the database alone. */
export async function nextWeekStage(
  repo: Repo,
  business: Business,
  opts: { scanAllowed?: boolean } = {},
): Promise<WeekStage> {
  const week = weekOf();
  if (!(await repo.getBusinessBrief(business.id))) return "brief";
  // Only a fresh signup with nothing read today gets a market scan: that is
  // the signup whose onboarding scan hiccuped, and the guard keeps a quiet
  // market from buying a paid scan on every visit.
  if (
    opts.scanAllowed !== false &&
    businessJustOnboarded(business.created_at) &&
    (await repo.listSignalsForCategory(business.category, { sinceDays: 1 })).length === 0
  ) {
    return "scan";
  }
  // The brand's own accounts and its rivals are read before the ranking,
  // so Brand and Competitive have something to grade on day one. Once a
  // day: an intel run writes competitor reads even when a platform refuses
  // the social read, so a refused read is not retried on every visit.
  if (opts.scanAllowed !== false && businessJustOnboarded(business.created_at)) {
    const [own, reads] = await Promise.all([
      repo.listSocialPosts(business.id, { competitorId: null, sinceDays: 120 }).catch(() => []),
      repo.listCompetitorReads(business.id, { sinceDays: 1 }).catch(() => []),
    ]);
    if (own.length === 0 && reads.length === 0) return "intel";
  }
  const opportunities = await repo.listOpportunities(business.id, week);
  if (opportunities.length === 0) {
    // A ranking writes a reading for every term it graded. Readings today
    // and no opportunities is a ranking that held everything: an honest
    // empty week, not one still to write. No reads for the category at all
    // is a market the ranking cannot read yet, and re-ranking cannot help.
    const readings = await repo.listSignalReadings(business.id, { sinceDays: 1 }).catch(() => []);
    if (readings.length > 0) return "done";
    const pool = await repo.listSignalsForCategory(business.category, { sinceDays: 14 });
    return pool.length > 0 ? "rank" : "done";
  }
  if ((await repo.countWeekPicks(business.id, week)) === 0) return "picks";
  return "done";
}

async function defaultBrief(repo: Repo, business: Business): Promise<void> {
  await repo.upsertBusinessBrief(await generateBusinessBrief(business, await repo.listServices(business.id)));
}

async function defaultScan(repo: Repo, business: Business): Promise<void> {
  const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
  await runSignalIngestForBusiness(repo, business);
}

async function defaultIntel(repo: Repo, business: Business): Promise<void> {
  if ((await repo.listCompetitors(business.id)).length === 0) {
    const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
    const seeded = await seedCompetitors(repo, business);
    if (seeded.note) console.log(`[week] rivals for ${business.id}: ${seeded.note}`);
  }
  const { runIntelIngestForBusiness } = await import("@/lib/intel/ingest");
  await runIntelIngestForBusiness(repo, business);
}

async function defaultRank(repo: Repo, business: Business): Promise<void> {
  const { rerankWeek } = await import("@/lib/recommend/rerank");
  await rerankWeek(repo, business, { picks: false });
}

async function defaultPicks(repo: Repo, business: Business): Promise<void> {
  const written = await generateWeekPicks(repo, business);
  console.log(`[week] picks for ${business.id}: ${written.ready} ready, ${written.draft} draft`);
}

/** Run one stage and say which comes next. Never throws past a stage: a
 * failed stage is logged and the week is re-read for what it still needs. */
export async function runWeekStage(
  repo: Repo,
  business: Business,
  stage: WeekStage,
  deps: StageDeps = {},
): Promise<WeekStage> {
  if (stage === "done") return "done";
  const run = {
    brief: deps.brief ?? defaultBrief,
    scan: deps.scan ?? defaultScan,
    intel: deps.intel ?? defaultIntel,
    rank: deps.rank ?? defaultRank,
    picks: deps.picks ?? defaultPicks,
  }[stage];
  try {
    await run(repo, business);
  } catch (err) {
    console.warn(`[week] stage ${stage} failed for ${business.id} (non-fatal):`, (err as Error).message);
    return "done";
  }
  switch (stage) {
    case "brief":
      return nextWeekStage(repo, business);
    case "scan":
      return nextWeekStage(repo, business);
    case "intel":
      return "rank";
    case "rank":
      return (await repo.listOpportunities(business.id, weekOf())).length > 0 ? "picks" : "done";
    default:
      return "done";
  }
}
