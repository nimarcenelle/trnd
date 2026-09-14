import { generateBusinessBrief, businessJustOnboarded } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { env, isEmailConfigured } from "@/lib/env";
import { weekOf } from "@/lib/recommend/week";

import { eligibleWeekOpportunities, generateWeekPicks } from "./generate";

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

export type WeekStage = "brief" | "scan" | "intel" | "rank" | "picks" | "deepen" | "done";

/** A stage says when its budget ran out with work left, so it runs again. */
export type StageOutcome = void | { exhausted?: boolean };

export interface StageDeps {
  brief?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  scan?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  intel?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  rank?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  picks?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  deepen?: (repo: Repo, business: Business) => Promise<StageOutcome>;
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
  const opportunities = await repo.listOpportunities(business.id, week);
  // A week ranked before the four-signal grade existed carries rows with no
  // grade; it is ranked again so its picks can carry one.
  if (opportunities.length > 0 && opportunities.every((o) => o.grade == null)) return "rank";
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
  const count = await repo.countWeekPicks(business.id, week);
  if (count === 0) return "picks";
  // A fresh signup's first pick is written alone so it lands sooner; the
  // rest of the week is still owed while only that one exists.
  if (count === 1 && businessJustOnboarded(business.created_at) && eligibleWeekOpportunities(opportunities).length > 1) {
    return "picks";
  }
  // Picks written from an ungraded ranking are written again once the
  // ranking has grades, so the page never shows a pick without its grade.
  const ready = await repo.listReadyPicks(business.id, week).catch(() => []);
  if (ready.length > 0 && ready.every((r) => r.pick.grade == null) && opportunities.some((o) => o.grade != null)) {
    return "picks";
  }
  // The first picks came from the fast, free reads. The brand's own
  // accounts, its rivals' ads and posts, and the scraped short-form reads
  // come after them, and the week is ranked and written again on top. Once
  // a day: an intel run writes competitor reads even when a platform refuses
  // the social read, so a refused read is not retried on every visit.
  if (opts.scanAllowed !== false && (await intelOwed(repo, business))) return "deepen";
  return "done";
}

/** Whether the intel read (own accounts and rivals) is still owed today:
 * the deepening pass a fresh signup gets after its first picks. */
export async function intelOwed(repo: Repo, business: Business): Promise<boolean> {
  if (!businessJustOnboarded(business.created_at)) return false;
  const [own, reads] = await Promise.all([
    repo.listSocialPosts(business.id, { competitorId: null, sinceDays: 120 }).catch(() => []),
    repo.listCompetitorReads(business.id, { sinceDays: 1 }).catch(() => []),
  ]);
  return own.length === 0 && reads.length === 0;
}

async function defaultBrief(repo: Repo, business: Business): Promise<void> {
  await repo.upsertBusinessBrief(await generateBusinessBrief(business, await repo.listServices(business.id)));
}

/** The first read is the fast tier alone: a first pick in minutes beats a
 * complete one in a quarter of an hour. The slow reads follow in deepen. */
async function defaultScan(repo: Repo, business: Business): Promise<StageOutcome> {
  const { runSignalIngestForBusiness, FAST_SCAN_BUDGET_MS } = await import("@/lib/signals/ingest");
  return runSignalIngestForBusiness(repo, business, { tier: "fast", budgetMs: FAST_SCAN_BUDGET_MS });
}

/** The slow reads (scraped short-form and rival ads) and the intel read,
 * together: each is minutes of I/O on different services. */
async function defaultDeepen(repo: Repo, business: Business): Promise<StageOutcome> {
  const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
  const [scan, intel] = await Promise.all([
    runSignalIngestForBusiness(repo, business, { tier: "slow" }).catch((err: Error) => {
      console.warn(`[week] deepen scan failed for ${business.id} (non-fatal):`, err.message);
      return undefined;
    }),
    defaultIntel(repo, business),
  ]);
  const exhausted = Boolean(scan && scan.exhausted) || Boolean(intel && typeof intel === "object" && intel.exhausted);
  return exhausted ? { exhausted } : undefined;
}

async function defaultIntel(repo: Repo, business: Business): Promise<StageOutcome> {
  if ((await repo.listCompetitors(business.id)).length === 0) {
    const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
    const seeded = await seedCompetitors(repo, business);
    if (seeded.note) console.log(`[week] rivals for ${business.id}: ${seeded.note}`);
  }
  const { runIntelIngestForBusiness } = await import("@/lib/intel/ingest");
  return runIntelIngestForBusiness(repo, business);
}

async function defaultRank(repo: Repo, business: Business): Promise<void> {
  const { rerankWeek } = await import("@/lib/recommend/rerank");
  await rerankWeek(repo, business, { picks: false });
}

async function defaultPicks(repo: Repo, business: Business): Promise<void> {
  const count = await repo.countWeekPicks(business.id, weekOf());
  const fresh = businessJustOnboarded(business.created_at);
  // A fresh signup gets its first pick alone, in about a third of the time
  // the five take, then the rest of the week with that one reused as built.
  // Nobody sits on a wait screen for the last pick when the first is ready.
  let built: Awaited<ReturnType<typeof generateWeekPicks>>["bundles"] = [];
  if (fresh && count === 0) {
    const first = await generateWeekPicks(repo, business, { limit: 1 });
    built = first.bundles;
    console.log(`[week] first pick for ${business.id}: ${first.ready} ready, ${first.draft} draft`);
  }
  const written = await generateWeekPicks(repo, business, { built });
  console.log(`[week] picks for ${business.id}: ${written.ready} ready, ${written.draft} draft`);
  if (fresh && count === 0 && written.ready > 0) await emailFirstPicks(repo, business, written.ready);
}

/**
 * The first picks take minutes to write, and nobody sits on a wait screen
 * for minutes. The owner gets one line when they land, with the link. A
 * missing email key skips quietly; the page still shows the picks.
 */
async function emailFirstPicks(repo: Repo, business: Business, count: number): Promise<void> {
  if (!isEmailConfigured) return;
  try {
    const owner = await repo.getProfile(business.owner_id);
    if (!owner?.email) return;
    const { sendEmail } = await import("@/lib/email/send");
    const { firstPicksSubject, renderFirstPicksEmail } = await import("@/lib/email/first-picks");
    const url = `${env.appUrl}/app/picks`;
    await sendEmail({
      to: owner.email,
      subject: firstPicksSubject(count),
      html: renderFirstPicksEmail({ businessName: business.name, count, url }),
    });
  } catch (err) {
    console.warn(`[week] first-picks email failed for ${business.id} (non-fatal):`, (err as Error).message);
  }
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
    deepen: deps.deepen ?? defaultDeepen,
  }[stage];
  let outcome: StageOutcome;
  try {
    outcome = await run(repo, business);
  } catch (err) {
    console.warn(`[week] stage ${stage} failed for ${business.id} (non-fatal):`, (err as Error).message);
    return "done";
  }
  // A read the budget cut short runs again: the next hop resumes where
  // this one stopped (terms and accounts read today are skipped).
  const exhausted = Boolean(outcome && typeof outcome === "object" && outcome.exhausted);
  switch (stage) {
    case "brief":
      return nextWeekStage(repo, business);
    case "scan":
      return exhausted ? "scan" : nextWeekStage(repo, business);
    case "intel":
      return exhausted ? "intel" : "rank";
    case "deepen":
      // The week is ranked and written again on top of what the deep read
      // found: the rivals' ads, the brand's own posts, the short-form reads.
      return exhausted ? "deepen" : "rank";
    case "rank":
      return (await repo.listOpportunities(business.id, weekOf())).length > 0 ? "picks" : "done";
    case "picks":
      // Only ever forward from here: the deep read, or done. Never back to a
      // ranking, whatever the fake or the failure left behind.
      return (await intelOwed(repo, business)) ? "deepen" : "done";
    default:
      return "done";
  }
}
