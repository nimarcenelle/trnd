import { businessJustOnboarded, targetCustomerOf } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { competitiveSet } from "@/lib/recommend/four-signals";
import { weekOf } from "@/lib/recommend/week";

import { sentenceCase } from "@/lib/text";

import { intelOwed, nextWeekStage, rivalDiscoveryConfigured, type WeekStage } from "./advance-week";
import { eligibleWeekOpportunities } from "./generate";

/**
 * The first-week wait, as facts. One screen from signup to the first pick:
 * each step is read from the database (not timed against a clock), the
 * steps already done say what they found, and what the reads turn up (the
 * analysis, rising terms, the rivals) shows as it lands, so the wait is
 * evidence arriving rather than a spinner.
 */

export interface ProgressStep {
  key: WeekStage;
  label: string;
  state: "done" | "current" | "todo";
  /** What the step found, once done: "5 rivals: Canopy, Sproos, Jolie". */
  detail: string | null;
  /** How long the step usually takes, in seconds. */
  typicalSec: number;
}

export interface WeekProgress {
  stage: WeekStage;
  steps: ProgressStep[];
  /** Ranked terms with their grades, once the ranking is in. */
  ranked: { term: string; grade: string | null }[];
  /** The analysis, as soon as it is written. */
  analysis: { positioning: string; who: string | null; segments: string[]; watchTerms: string[] } | null;
  /** What the reads have turned up so far. */
  found: {
    terms: { term: string; deltaPct: number | null; source: string }[];
    rivals: { name: string; ads: number | null }[];
    ownPosts: number;
  };
  /** Seconds the remaining steps usually take, from the current one on. */
  remainingSec: number;
}

/** The wait screen's steps: what stands between a signup and its first
 * pick. The deepening pass comes after the picks and is not a wait. */
const ORDER: WeekStage[] = ["brief", "scan", "rivals", "rank", "picks"];

/**
 * Whether the deep read (the brand's own accounts, its rivals, the scraped
 * short-form) is still running behind a fresh signup's first picks. The
 * picks are ranked and written again when it lands.
 */
export async function weekDeepening(repo: Repo, business: Business): Promise<boolean> {
  if (!businessJustOnboarded(business.created_at)) return false;
  return intelOwed(repo, business);
}

/**
 * The wait screen's headline: the first specific thing TRND can say about
 * this brand, the moment it can say it. A job label is the fallback, never
 * the lead.
 */
export function waitHeadline(progress: Pick<WeekProgress, "stage" | "analysis" | "found" | "ranked">, businessName: string): string {
  const name = sentenceCase(businessName);
  if (progress.stage === "brief" || !progress.analysis) return `Reading ${name}`;
  const top = progress.ranked[0];
  if (progress.stage === "picks" && top) return `Writing your first pick: ${sentenceCase(top.term)}${top.grade ? `, graded ${top.grade}` : ""}`;
  if (progress.stage === "rank") {
    return progress.found.terms.length > 0
      ? `Grading ${n(progress.found.terms.length, "rising term")} for ${name}`
      : `Grading this week for ${name}`;
  }
  const rising = progress.found.terms[0];
  if (rising) return `"${sentenceCase(rising.term)}" is up ${rising.deltaPct}% for your customers right now`;
  const who = progress.analysis.who;
  return who ? `We read ${name}. Now reading what ${who.replace(/\.$/, "")} search for` : `We read ${name}. Now reading your market`;
}

/**
 * How many picks a fresh signup's week still owes: the first pick is written
 * alone, and while it is the only one the rest are on their way. Zero once
 * the week is whole, or for any business past its first days.
 */
export async function weekStillWriting(repo: Repo, business: Business): Promise<number> {
  if (!businessJustOnboarded(business.created_at)) return 0;
  const week = weekOf();
  const [count, opportunities] = await Promise.all([
    repo.countWeekPicks(business.id, week),
    repo.listOpportunities(business.id, week),
  ]);
  const expected = eligibleWeekOpportunities(opportunities).length;
  return count === 1 && expected > 1 ? expected - 1 : 0;
}

const LABELS: Record<WeekStage, string> = {
  brief: "Reading your business",
  scan: "Reading demand for your terms",
  rivals: "Finding your competitors and reading their ads",
  intel: "Reading your accounts and your competitors",
  rank: "Grading this week's opportunities",
  picks: "Writing your picks",
  deepen: "Reading your rivals' ads and what's winning on short-form",
  done: "Done",
};

/** Typical wall time per step. The scan and the intel read run together on a
 * fresh signup, so intel's own figure is the extra it adds past the scan. */
export const TYPICAL_SEC: Record<WeekStage, number> = {
  brief: 40,
  scan: 60,
  rivals: 60,
  intel: 20,
  rank: 45,
  picks: 30,
  deepen: 200,
  done: 0,
};

const list = (names: string[], max = 4) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export async function weekProgress(repo: Repo, business: Business, opts: { scanAllowed?: boolean } = {}): Promise<WeekProgress> {
  const week = weekOf();
  const derived = await nextWeekStage(repo, business, opts);
  const [brief, signals, own, competitors, rivalPosts, opportunities, reads] = await Promise.all([
    repo.getBusinessBrief(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 1 }).catch(() => []),
    repo.listSocialPosts(business.id, { competitorId: null, sinceDays: 120 }).catch(() => []),
    repo.listCompetitors(business.id).catch(() => []),
    repo.listSocialPosts(business.id, { sinceDays: 45 }).then((ps) => ps.filter((p) => p.competitor_id)).catch(() => []),
    repo.listOpportunities(business.id, week).catch(() => []),
    repo.listCompetitorReads(business.id, { sinceDays: 2 }).catch(() => []),
  ]);
  const terms = new Set(signals.map((s) => s.term));
  const rivals = competitiveSet(competitors);
  // The rivals step is a hand-off between the scan and the ranking, not a
  // state the database names: while it runs, the week reads as "rank" with
  // no rivals on record. Shown as the step it is.
  const stage: WeekStage =
    derived === "rank" &&
    opts.scanAllowed !== false &&
    businessJustOnboarded(business.created_at) &&
    competitors.length === 0 &&
    rivalDiscoveryConfigured(business)
      ? "rivals"
      : derived;
  const at = stage === "done" || !ORDER.includes(stage) ? ORDER.length : ORDER.indexOf(stage);
  const adsByRival = new Map<string, number>();
  for (const r of reads) if (r.kind === "ads" && finite(r.value)) adsByRival.set(r.competitor_id, r.value);
  const adsRead = rivals.filter((c) => adsByRival.has(c.id)).length;

  const details: Record<WeekStage, string | null> = {
    brief: brief ? `${n(brief.watch_terms?.length ?? 0, "term")} to watch` : null,
    scan: terms.size > 0 ? `${n(terms.size, "term")} read across ${n(new Set(signals.map((s) => s.source)).size, "source")}` : null,
    rivals:
      rivals.length > 0
        ? `${n(rivals.length, "competitor")}: ${list(rivals.map((c) => c.name))}${adsRead > 0 ? ` · ads read for ${adsRead}` : ""}`
        : null,
    intel:
      rivals.length > 0 || own.length > 0
        ? [
            own.length > 0 ? `${own.length} of your posts` : null,
            rivals.length > 0 ? `${rivals.length} competitor${rivals.length === 1 ? "" : "s"}: ${list(rivals.map((c) => c.name))}` : null,
            rivalPosts.length > 0 ? `${rivalPosts.length} of their posts` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
    rank: opportunities.length > 0 ? `${opportunities.length} graded` : null,
    picks: null,
    deepen: null,
    done: null,
  };

  const ranked = await Promise.all(
    eligibleWeekOpportunities(opportunities).map(async (o) => ({
      term: (await repo.getSignal(o.signal_id))?.term ?? "",
      grade: o.grade ?? null,
    })),
  );

  // The rising terms so far: one row per term, the strongest change first.
  const byTerm = new Map<string, { term: string; deltaPct: number | null; source: string }>();
  for (const s of [...signals].sort((a, b) => (finite(b.delta_pct) ? b.delta_pct : -1) - (finite(a.delta_pct) ? a.delta_pct : -1))) {
    if (!byTerm.has(s.term)) byTerm.set(s.term, { term: s.term, deltaPct: finite(s.delta_pct) ? Math.round(s.delta_pct) : null, source: s.source });
  }
  const who = targetCustomerOf(brief)?.who ?? null;
  const steps: ProgressStep[] = ORDER.map((key, i) => ({
    key,
    label: LABELS[key],
    state: i < at ? "done" : i === at ? "current" : "todo",
    detail: i < at ? details[key] : null,
    typicalSec: TYPICAL_SEC[key],
  }));

  return {
    stage,
    steps,
    ranked: ranked.filter((r) => r.term),
    analysis: brief
      ? {
          positioning: brief.positioning ?? "",
          who,
          segments: (brief.customer_segments ?? []).slice(0, 3),
          watchTerms: (brief.watch_terms ?? []).slice(0, 8),
        }
      : null,
    found: {
      terms: [...byTerm.values()].filter((t) => t.deltaPct !== null && t.deltaPct > 0).slice(0, 6),
      rivals: rivals.slice(0, 5).map((c) => ({ name: c.name, ads: adsByRival.get(c.id) ?? null })),
      ownPosts: own.length,
    },
    remainingSec: steps.filter((s) => s.state !== "done").reduce((a, s) => a + s.typicalSec, 0),
  };
}
