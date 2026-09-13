import { targetCustomerOf } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { competitiveSet } from "@/lib/recommend/four-signals";
import { weekOf } from "@/lib/recommend/week";

import { nextWeekStage, type WeekStage } from "./advance-week";
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

const ORDER: WeekStage[] = ["brief", "scan", "intel", "rank", "picks"];

const LABELS: Record<WeekStage, string> = {
  brief: "Reading your business",
  scan: "Reading demand for your terms",
  intel: "Reading your accounts and your competitors",
  rank: "Grading this week's opportunities",
  picks: "Writing your picks",
  done: "Done",
};

/** Typical wall time per step. The scan and the intel read run together on a
 * fresh signup, so intel's own figure is the extra it adds past the scan. */
export const TYPICAL_SEC: Record<WeekStage, number> = {
  brief: 40,
  scan: 100,
  intel: 20,
  rank: 45,
  picks: 30,
  done: 0,
};

const list = (names: string[], max = 4) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export async function weekProgress(repo: Repo, business: Business, opts: { scanAllowed?: boolean } = {}): Promise<WeekProgress> {
  const week = weekOf();
  const stage = await nextWeekStage(repo, business, opts);
  const at = stage === "done" ? ORDER.length : ORDER.indexOf(stage);

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

  const details: Record<WeekStage, string | null> = {
    brief: brief ? `${n(brief.watch_terms?.length ?? 0, "term")} to watch` : null,
    scan: terms.size > 0 ? `${n(terms.size, "term")} read across ${n(new Set(signals.map((s) => s.source)).size, "source")}` : null,
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
  const adsByRival = new Map<string, number>();
  for (const r of reads) if (r.kind === "ads" && finite(r.value)) adsByRival.set(r.competitor_id, r.value);

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
