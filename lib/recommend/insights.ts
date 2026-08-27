import type { Learning, Signal } from "@/lib/db/types";
import type { ScoredOpportunity } from "@/lib/scoring";
import { sentenceCase } from "@/lib/text";

/**
 * Structured, layered insights — the anti-text-wall.
 * Every insight is a short bold headline (scannable in one glance) plus one
 * sentence of detail for people who want the depth. Screens render headlines
 * by default and reveal details on demand.
 */
export interface Insight {
  kind: "momentum" | "fit" | "gap" | "history";
  /** ≤ 8 words. The takeaway, not the explanation. */
  headline: string;
  /** One sentence. The explanation, shown on expand. */
  detail: string;
}

export interface NextAction {
  label: string;
  detail: string;
}

const metricLabel = (m: string) => m.replace(/_/g, " ");

export function buildInsights(
  signal: Signal,
  scored: ScoredOpportunity,
  opts: { learnings: Learning[] },
): Insight[] {
  const insights: Insight[] = [];

  // ---- momentum
  const delta = signal.delta_pct;
  if (typeof delta === "number") {
    const speed =
      delta >= 40
        ? "One of the fastest risers in your category right now."
        : delta >= 20
          ? "Well above normal weekly movement for your category."
          : "A steady climb — lower risk of a fad spike.";
    insights.push({
      kind: "momentum",
      headline: `↑${Math.round(delta)}% ${metricLabel(signal.metric_type)} this week`,
      detail: `${speed} Rises like this typically crest within a few weeks — the window matters.`,
    });
  } else {
    insights.push({
      kind: "momentum",
      headline: `Trending in ${metricLabel(signal.metric_type)}`,
      detail: "Movement is visible but the weekly delta isn't measurable yet — worth watching.",
    });
  }

  // ---- fit
  if (scored.matchedService) {
    insights.push({
      kind: "fit",
      headline: `You already sell this`,
      detail: `Maps to ${scored.matchedService.name} — you can promote it with zero new inventory or training.`,
    });
  } else if (scored.components.serviceMatch < 0.35) {
    // A mismatch the fit gate kept only because the week was thin. Say so —
    // dressing it up as a "new offer" is exactly the confident nonsense TRND
    // exists to avoid.
    insights.push({
      kind: "fit",
      headline: "Outside your lane",
      detail:
        "This trend doesn't map to anything you sell — it ranked on momentum in your category, not fit. Skip it unless you actually want to add the offer.",
    });
  } else {
    insights.push({
      kind: "fit",
      headline: "New offer opportunity",
      detail:
        "Nothing on your menu maps directly — a simple intro offer would let you capture this demand without a new service line.",
    });
  }

  // ---- competitor gap
  const gap = scored.components.competitorGap;
  if (gap > 0.66) {
    insights.push({
      kind: "gap",
      headline: "Competitors haven't moved",
      detail:
        "Local ad coverage of this looks light (proxy estimate) — early movers usually get cheaper clicks and own the association.",
    });
  } else if (gap > 0.33) {
    insights.push({
      kind: "gap",
      headline: "Some competition already",
      detail:
        "A few local players are on this — a sharper angle still wins, but the easy window is narrowing.",
    });
  } else {
    insights.push({
      kind: "gap",
      headline: "Crowded space",
      detail:
        "Local saturation looks high — you'd need a clearly different angle to stand out, and the score reflects that.",
    });
  }

  // ---- history: only measured results count as track record. Seeded priors
  // exist so day-one scores aren't blind, but they are never presented as
  // real campaigns that ran.
  const measured = opts.learnings.filter((l) => l.source === "measured");
  const seeded = opts.learnings.filter((l) => l.source === "seed");
  if (measured.length > 0) {
    const top = [...measured].sort((a, b) => Number(b.lift) - Number(a.lift))[0];
    const n = measured.reduce((s, l) => s + l.sample_size, 0);
    insights.push({
      kind: "history",
      headline: sentenceCase(`${top.angle_type.replace(/_/g, " ")} angles ran well before`),
      detail: `${n} recorded result${n === 1 ? "" : "s"} in your category feed this score — the recommended angle leans on what actually converted.`,
    });
  } else if (seeded.length > 0) {
    insights.push({
      kind: "history",
      headline: "Illustrative prior — no results yet",
      detail:
        "This component starts from a seeded category pattern so day-one scores aren't blind. It's labeled illustrative and is replaced by your first recorded result.",
    });
  } else {
    insights.push({
      kind: "history",
      headline: "No track record yet",
      detail:
        "Neutral prior for now — every result you record sharpens this component for you and businesses like yours.",
    });
  }

  return insights;
}

/** Price-band-sized daily budget, shared with the campaign screen. */
export function budgetFor(priceBand: string | null): { daily: string; test: string } {
  switch (priceBand) {
    case "$":
      return { daily: "$15–25", test: "$120 over 6 days" };
    case "$$$":
      return { daily: "$50–90", test: "$420 over 6 days" };
    default:
      return { daily: "$25–50", test: "$220 over 6 days" };
  }
}

export function buildNextAction(opts: {
  hasCampaign: boolean;
  launchBy: string; // e.g. "Aug 27"
  priceBand: string | null;
}): NextAction {
  const budget = budgetFor(opts.priceBand);
  if (opts.hasCampaign) {
    return {
      label: "Review and launch your campaign",
      detail: `Everything is copy-paste ready. Aim to be live by ${opts.launchBy} at ${budget.daily}/day to ride the rise.`,
    };
  }
  return {
    label: "Build the campaign — under a minute",
    detail: `You'll get headlines, scripts, statics, and targeting. Aim to be live by ${opts.launchBy} at ${budget.daily}/day.`,
  };
}

/** One-line takeaway for the results screen. Never a paragraph. */
export function buildResultsTakeaway(opts: {
  avgCtr: number | null;
  benchmark: number;
  roas: number | null;
}): string | null {
  const { avgCtr, benchmark, roas } = opts;
  if (avgCtr === null && roas === null) return null;
  const parts: string[] = [];
  if (avgCtr !== null) {
    const rel = avgCtr / benchmark;
    if (rel >= 1.2) {
      parts.push(`Your CTR runs ${Math.round((rel - 1) * 100)}% above category typical — the angle is landing`);
    } else if (rel >= 0.85) {
      parts.push("Your CTR sits around category typical — a hook test could buy you the next jump");
    } else {
      parts.push("Your CTR trails category typical — swap in the next headline variant before adding spend");
    }
  }
  if (roas !== null) {
    parts.push(
      roas >= 2
        ? `${roas.toFixed(1)}× return says scale the winner`
        : `${roas.toFixed(1)}× return — hold spend until the ratio clears 2×`,
    );
  }
  return parts.join("; ") + ".";
}
