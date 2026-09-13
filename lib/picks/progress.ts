import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { competitiveSet } from "@/lib/recommend/four-signals";
import { weekOf } from "@/lib/recommend/week";

import { nextWeekStage, type WeekStage } from "./advance-week";

/**
 * The first-week wait, as facts. One screen from signup to the first pick:
 * each step is read from the database (not timed against a clock), and the
 * steps already done say what they found, so the wait shows work landing
 * rather than a spinner.
 */

export interface ProgressStep {
  key: WeekStage;
  label: string;
  state: "done" | "current" | "todo";
  /** What the step found, once done: "5 rivals: Canopy, Sproos, Jolie". */
  detail: string | null;
}

export interface WeekProgress {
  stage: WeekStage;
  steps: ProgressStep[];
  /** Ranked terms with their grades, once the ranking is in. */
  ranked: { term: string; grade: string | null }[];
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

const list = (names: string[], max = 4) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

export async function weekProgress(repo: Repo, business: Business, opts: { scanAllowed?: boolean } = {}): Promise<WeekProgress> {
  const week = weekOf();
  const stage = await nextWeekStage(repo, business, opts);
  const at = stage === "done" ? ORDER.length : ORDER.indexOf(stage);

  const [brief, signals, own, competitors, rivalPosts, opportunities] = await Promise.all([
    repo.getBusinessBrief(business.id),
    repo.listSignalsForCategory(business.category, { sinceDays: 1 }).catch(() => []),
    repo.listSocialPosts(business.id, { competitorId: null, sinceDays: 120 }).catch(() => []),
    repo.listCompetitors(business.id).catch(() => []),
    repo.listSocialPosts(business.id, { sinceDays: 45 }).then((ps) => ps.filter((p) => p.competitor_id)).catch(() => []),
    repo.listOpportunities(business.id, week).catch(() => []),
  ]);
  const terms = new Set(signals.map((s) => s.term));
  const rivals = competitiveSet(competitors);

  const details: Record<WeekStage, string | null> = {
    brief: brief ? `${brief.watch_terms.length} terms to watch` : null,
    scan: terms.size > 0 ? `${terms.size} terms read across ${new Set(signals.map((s) => s.source)).size} sources` : null,
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
    opportunities.slice(0, 5).map(async (o) => ({ term: (await repo.getSignal(o.signal_id))?.term ?? "", grade: o.grade ?? null })),
  );

  return {
    stage,
    steps: ORDER.map((key, i) => ({
      key,
      label: LABELS[key],
      state: i < at ? "done" : i === at ? "current" : "todo",
      detail: i < at ? details[key] : null,
    })),
    ranked: ranked.filter((r) => r.term),
  };
}
