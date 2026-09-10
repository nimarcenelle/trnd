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
  opts: {
    learnings: Learning[];
    /** Judged-thin week: the trend doesn't fit this business, and the fit
     * insight must say so instead of pitching a new offer. */
    unfit?: boolean;
    /** The relevance judge's one-line reason, when the ranking stored one. */
    snapshotReason?: string | null;
  },
): Insight[] {
  const insights: Insight[] = [];

  // ---- momentum
  const delta = signal.delta_pct;
  if (signal.metric_type === "weather_trigger") {
    // Forecast-derived: the honest framing is a window, not a measured rise.
    const raw = signal.raw as { detail?: string } | null;
    insights.push({
      kind: "momentum",
      headline: "Weather window · next 7 days",
      detail: `${raw?.detail ?? "The forecast crosses a seasonal threshold this week."} Demand estimate is forecast-derived, not a measured trend.`,
    });
  } else if (signal.source === "snapshot") {
    insights.push({
      kind: "momentum",
      headline: "Steady demand — not a spike",
      detail:
        "One of your snapshot's demand terms: people search this year-round when they want what you sell. There's no trend window to miss — it's ready whenever you are.",
    });
  } else if (scored.sparse) {
    insights.push({
      kind: "momentum",
      headline: `Below Google's meter in ${signal.geo === "US" ? "the US" : signal.geo.replace(/^US-/, "")}`,
      detail:
        "Google can't chart this term at your level yet — too few searches to measure. It ranks as an idea that fits you, not a measured wave, and the score is scaled down to say so.",
    });
  } else if (typeof delta === "number") {
    const month = typeof scored.monthPct === "number" ? scored.monthPct : null;
    const monthText =
      month !== null
        ? ` Across 30 days it's ${month >= 0 ? "up" : "down"} ${Math.abs(Math.round(month))}% (last week's average against the first).`
        : "";
    // A quiet week inside a month-long climb is a climb, not a stall.
    if (delta < 10 && month !== null && month >= 20) {
      insights.push({
        kind: "momentum",
        headline: `↑${Math.round(month)}% ${metricLabel(signal.metric_type)} over 30 days`,
        detail: `Flat vs last week (${delta >= 0 ? "+" : ""}${Math.round(delta)}%) but a sustained climb across the month — steadier than a spike, and the stars weigh both.${monthText}`,
      });
    } else {
      const speed =
        delta < 0
          ? "Coming off its peak — attention is cheaper here, but the wave is receding."
          : delta >= 40
            ? "One of the fastest risers in your category right now."
            : delta >= 20
              ? "Well above normal weekly movement for your category."
              : "A steady climb — lower risk of a fad spike.";
      insights.push({
        kind: "momentum",
        headline: `${delta >= 0 ? "↑" : "↓"}${Math.abs(Math.round(delta))}% ${metricLabel(signal.metric_type)} vs last week`,
        detail:
          delta < 0
            ? `${speed}${monthText}`
            : `${speed}${monthText} Rises like this typically crest within a few weeks — the window matters.`,
      });
    }
  } else {
    insights.push({
      kind: "momentum",
      headline: `Trending in ${metricLabel(signal.metric_type)}`,
      detail: "Movement is visible but the weekly delta isn't measurable yet — worth watching.",
    });
  }

  // ---- fit
  if (opts.unfit) {
    insights.push({
      kind: "fit",
      headline: "Doesn't map to what you sell",
      detail:
        opts.snapshotReason ??
        "TRND's read of your business found no credible way to run this — treat it as market context, not a campaign.",
    });
  } else if (scored.matchedService) {
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
        "We don't see many nearby businesses advertising this yet — early movers usually get cheaper clicks and own the idea.",
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
        "A lot of nearby businesses are already advertising this — you'd need a clearly different angle, and the score reflects that.",
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
      headline: "Example history — no results yet",
      detail:
        "This part of the score starts from an example pattern for your category so day one isn't blind. Your first real result replaces it.",
    });
  } else {
    insights.push({
      kind: "history",
      headline: "No track record yet",
      detail:
        "Scored down the middle for now — every result you record sharpens this for you and businesses like yours.",
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
