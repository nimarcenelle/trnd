import { generateBusinessBrief, businessJustOnboarded } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business, CompetitorRead, Opportunity } from "@/lib/db/types";
import { env, isEmailConfigured, isGeminiConfigured, isPlacesConfigured } from "@/lib/env";
import { weekOf } from "@/lib/recommend/week";
import { NO_COMPETITORS_NOTE, NOTHING_READ_NOTE } from "@/lib/scoring/competitive";

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

export type WeekStage = "brief" | "scan" | "rivals" | "intel" | "rank" | "picks" | "deepen" | "done";
export const WEEK_STAGES: WeekStage[] = ["brief", "scan", "rivals", "intel", "rank", "picks", "deepen", "done"];

/** A stage says when its budget ran out with work left, so it runs again. */
export type StageOutcome = void | { exhausted?: boolean };

export interface StageDeps {
  brief?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  scan?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  rivals?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  intel?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  rank?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  picks?: (repo: Repo, business: Business) => Promise<StageOutcome>;
  deepen?: (repo: Repo, business: Business) => Promise<StageOutcome>;
}

/* ------------------------- graded before the rivals ------------------------- */

/** How the Competitive signal stood when a row was graded: never graded,
 * graded with no rivals on record, graded with rivals but none of their ads
 * read, or graded on real ad reads. */
type CompetitiveGap = "no-rivals" | "no-ads" | "scored" | null;

function competitiveGapOf(row: { signal_scores?: Record<string, unknown> | null }): CompetitiveGap {
  const s = row.signal_scores?.competitive as { confidence?: unknown; note?: unknown } | undefined;
  if (!s || typeof s !== "object") return null;
  if (s.confidence !== "low") return "scored";
  const note = typeof s.note === "string" ? s.note.trim().toLowerCase() : "";
  if (note.startsWith(NO_COMPETITORS_NOTE.toLowerCase())) return "no-rivals";
  if (note.startsWith(NOTHING_READ_NOTE.toLowerCase())) return "no-ads";
  return "scored";
}

function adsSeen(read: CompetitorRead): boolean {
  if (read.kind !== "ads" && read.kind !== "google_ads") return false;
  const raw = read.raw as { ads?: unknown; sample?: unknown } | null;
  return (Array.isArray(raw?.ads) && raw.ads.length > 0) || (Array.isArray(raw?.sample) && raw.sample.length > 0);
}

/**
 * Whether the week was graded before its rivals could count. Rinse was
 * ranked 78 seconds after signup with "no competitors connected yet", its
 * seven rivals landed two minutes later, and nothing ever graded it again:
 * the job route re-derived every stage from the database, and nothing in
 * the database said "the rivals are newer than the grade". This does. It
 * cannot loop: a re-ranking with rivals on record changes the note, and a
 * re-ranking with their ads read scores the signal.
 */
export async function gradedBeforeRivals(repo: Repo, business: Business, opportunities: Opportunity[]): Promise<boolean> {
  const gaps = opportunities.map(competitiveGapOf);
  if (gaps.some((g) => g === "no-rivals")) {
    const competitors = await repo.listCompetitors(business.id).catch(() => []);
    if (competitors.length > 0) return true;
  }
  if (gaps.some((g) => g === "no-ads")) {
    const reads = await repo.listCompetitorReads(business.id, { sinceDays: 2 }).catch(() => []);
    if (reads.some(adsSeen)) return true;
  }
  return false;
}

/** Picks written from a grade the ranking has since replaced: the picks
 * still say "no competitors connected yet" while the ranked rows do not. */
function picksBehindGrade(
  picks: { signal_scores?: Record<string, unknown> | null }[],
  opportunities: Opportunity[],
): boolean {
  const stale = (g: CompetitiveGap) => g === "no-rivals" || g === "no-ads";
  if (picks.length === 0 || !picks.some((p) => stale(competitiveGapOf(p)))) return false;
  return opportunities.some((o) => competitiveGapOf(o) === "scored");
}

/** Whether rival discovery can run for this brand at all: brands are named
 * by the model and verified on the web; places come from Places. */
export function rivalDiscoveryConfigured(business: Business): boolean {
  return business.market === "online" ? isGeminiConfigured : isPlacesConfigured;
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
  // A fresh signup graded before its rivals (or their ads) were on record
  // is graded again now that they are. See gradedBeforeRivals.
  const fresh = businessJustOnboarded(business.created_at);
  if (fresh && opportunities.length > 0 && (await gradedBeforeRivals(repo, business, opportunities))) return "rank";
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
  // Picks that still carry the grade from before the rivals were read are
  // written again from the re-graded rows.
  if (fresh && picksBehindGrade(ready.map((r) => r.pick), opportunities)) return "picks";
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

/** Seeding plus one ad read per rival fits well inside a hop: the model
 * names the brands in about ten seconds, twelve sites and their Ad Library
 * checks take thirty, and the ads themselves are seconds per rival. */
export const RIVALS_BUDGET_MS = 150_000;

/**
 * The rivals and their ads, before the first grade. A grade that excludes
 * Competitive on a brand with seven direct rivals in Settings is the first
 * thing a paid social manager distrusts, and it is what every fresh signup
 * used to see for its first ten minutes (or, when the hand-off died, for
 * the week). The account reads and the scraped short-form still wait for
 * the picks; this is only what the Competitive signal needs to count.
 */
async function defaultRivals(repo: Repo, business: Business): Promise<StageOutcome> {
  const deadline = Date.now() + RIVALS_BUDGET_MS;
  if ((await repo.listCompetitors(business.id)).length === 0) {
    const { seedCompetitors } = await import("@/lib/intel/seed-competitors");
    const seeded = await seedCompetitors(repo, business);
    if (seeded.note) console.log(`[week] rivals for ${business.id}: ${seeded.note}`);
  }
  const competitors = await repo.listCompetitors(business.id);
  if (competitors.length === 0) return;
  const { ingestRivalAds } = await import("@/lib/intel/social-ingest");
  const ads = await ingestRivalAds(repo, business, competitors, { deadline });
  console.log(`[week] rival ads for ${business.id}: ${ads.written} reads${ads.exhausted ? ", cut short" : ""}`);
  return ads.exhausted ? { exhausted: true } : undefined;
}

/** A fresh signup with no rivals on record reads them before its first grade. */
async function rivalsOwed(repo: Repo, business: Business, deps: StageDeps): Promise<boolean> {
  if (!businessJustOnboarded(business.created_at)) return false;
  if (!deps.rivals && !rivalDiscoveryConfigured(business)) return false;
  return (await repo.listCompetitors(business.id).catch(() => [])).length === 0;
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
    rivals: deps.rivals ?? defaultRivals,
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
      if (exhausted) return "scan";
      // The rivals and their ads go before the first grade, never after it.
      if (await rivalsOwed(repo, business, deps)) return "rivals";
      return nextWeekStage(repo, business);
    case "rivals":
      return exhausted ? "rivals" : "rank";
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
