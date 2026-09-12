import type { BusinessMarket, Learning, Signal } from "@/lib/db/types";
import type { ScoredOpportunity } from "@/lib/scoring";
import { deltaWindowLabel, metricLabel } from "@/lib/signals/source-url";
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



/** 1_240_000 → "1.2M" — view counts are the unit of short-form, and nobody
 * reads seven digits on a phone. */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

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
      headline: "Weather window, next 7 days",
      detail: `${raw?.detail ?? "The forecast crosses a seasonal threshold this week."} Demand estimate is forecast-derived, not a measured trend.`,
    });
  } else if (signal.metric_type === "shortform_views") {
    // Short-form is the basis of the product, so its read gets said in its
    // own units — what people are watching, how hard, in what shape, and
    // who keeps making it. The delta is velocity (views per hour since
    // publish), not raw totals, so the wording stays "climbing", never
    // "more views than last week" — which is a different claim.
    const raw = signal.raw as {
      uploads?: number;
      uploadsPrev?: number;
      engagementPct?: number | null;
      medianDurationSec?: number | null;
      repeatChannels?: string[];
      actionPct?: number | null;
      top?: { title?: string; channel?: string; views?: number; durationSec?: number } | null;
      breakout?: { id?: string; title?: string; channel?: string; views?: number } | null;
      adjusted?: boolean;
      measuredTerm?: string;
    } | null;
    const views = Number(signal.value) || 0;
    // The same metric now arrives from two platforms; calling a TikTok read
    // "Shorts" is a small lie that the proof link immediately exposes.
    const platform = signal.source === "tiktok" ? "TikTok" : "Shorts";
    const uploads = typeof raw?.uploads === "number" ? raw.uploads : null;
    const madeMore = typeof raw?.uploadsPrev === "number" && uploads !== null && uploads > raw.uploadsPrev;
    const top = raw?.top ?? null;
    const breakout = raw?.breakout ?? null;
    const secs = typeof raw?.medianDurationSec === "number" ? Math.round(raw.medianDurationSec) : null;
    const engagement = typeof raw?.engagementPct === "number" ? raw.engagementPct : null;
    const repeats = raw?.repeatChannels ?? [];
    insights.push({
      kind: "momentum",
      headline:
        typeof delta === "number"
          ? `${platform} on this are climbing ${delta >= 0 ? "↑" : "↓"}${Math.abs(Math.round(delta))}%`
          : `${compactCount(views)} views on ${platform} this week`,
      detail: [
        `${compactCount(views)} views across the ${platform === "TikTok" ? "TikToks" : "Shorts"} posted about this in the last 7 days${
          uploads !== null ? `, from ${uploads} new video${uploads === 1 ? "" : "s"}` : ""
        }.`,
        // The two most copyable facts about a format: how long, and whether
        // anyone reacts. Both come free with the read.
        secs !== null ? `The ones winning run about ${secs}s.` : "",
        engagement !== null && engagement >= 4
          ? `They pull ${engagement}% likes and comments per view — people are reacting, not just autoplaying past.`
          : engagement !== null && engagement < 1.5
            ? `Engagement is thin at ${engagement}% per view — the views are passive, so lead with the offer rather than the trend.`
            : "",
        // Shares and saves only come from the TikTok read, and they are the
        // truest signal that a video made somebody act rather than scroll.
        typeof raw?.actionPct === "number" && raw.actionPct >= 1
          ? `${raw.actionPct}% of views turned into a share or a save — people are passing it on, which is what a local offer needs.`
          : "",
        madeMore ? "More creators posted about it this week than last — the format is still open." : "",
        repeats.length > 0
          ? `${repeats[0]} has posted more than once on this in seven days — it's a format being worked, not a one-off.`
          : "",
        top?.title
          ? `The one pulling the most: "${top.title}"${top.channel ? ` (${top.channel})` : ""} — worth 30 seconds before you shoot yours.`
          : "",
        breakout && breakout.id && breakout.title && breakout.title !== top?.title
          ? `Climbing fastest from a standing start: "${breakout.title}" — closer to what a small account can do.`
          : "",
        // The same disclosure the Trends read makes: never let a widened
        // read pass as a measurement of the local term.
        raw?.adjusted && raw.measuredTerm
          ? `Measured on "${raw.measuredTerm}" — too few Shorts carry the local phrasing to read it directly.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  } else if (signal.source === "tiktok") {
    const raw = signal.raw as { hashtagName?: string; categoryBearing?: boolean } | null;
    const posts = Number(signal.value) || 0;
    // A board row that carries no word about what the industry sells is a
    // national moment the industry's advertisers happened to post into —
    // real, but not a category trend, and saying otherwise is the scraper
    // voice.
    const generic = raw?.categoryBearing === false;
    insights.push({
      kind: "momentum",
      headline:
        typeof delta === "number"
          ? `${delta >= 0 ? "↑" : "↓"}${Math.abs(Math.round(delta))}% posts on TikTok this week`
          : `${compactCount(posts)} TikTok posts on this`,
      detail: [
        `${compactCount(posts)} posts under ${raw?.hashtagName ? `#${String(raw.hashtagName).replace(/^#/, "")}` : "this hashtag"} — TikTok's own trending board for your industry, national.`,
        generic
          ? "It's a moment the whole country is posting into rather than a trend about what you sell — worth timing an offer to, not building one on."
          : "",
        "Local demand is confirmed by the search read below, not by this.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  } else if (signal.source === "snapshot") {
    // An evergreen watch term. Say what was measured — and when nothing
    // was, say that, instead of dressing an unread term as "steady".
    const week = typeof scored.weekPct === "number" ? scored.weekPct : null;
    const month = typeof scored.monthPct === "number" ? scored.monthPct : null;
    const monthText =
      month !== null
        ? ` Across 30 days it's ${month >= 0 ? "up" : "down"} ${Math.abs(Math.round(month))}% (last week's average against the first).`
        : "";
    if (week !== null) {
      insights.push({
        kind: "momentum",
        headline: `Year-round demand · ${week >= 0 ? "↑" : "↓"}${Math.abs(Math.round(week))}% this week`,
        detail: `One of your snapshot's demand terms — people search it whenever they need what you sell, so there's no window to miss. This week's search interest is ${week >= 0 ? "up" : "down"} ${Math.abs(Math.round(week))}% against last week.${monthText}`,
      });
    } else {
      insights.push({
        kind: "momentum",
        headline: "Year-round demand, no weekly read yet",
        detail: `One of your snapshot's demand terms — people search it whenever they need what you sell. Google hasn't returned a weekly read on it yet, so momentum is scored below neutral and the total is held down: this ranks as a sure play, not a measured wave.${monthText}`,
      });
    }
  } else if (scored.sparse) {
    insights.push({
      kind: "momentum",
      headline: `Too few searches to measure in ${signal.geo === "US" ? "the US" : signal.geo.replace(/^US-/, "")}`,
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
        detail: `Flat ${deltaWindowLabel(signal.source)} (${delta >= 0 ? "+" : ""}${Math.round(delta)}%) but a sustained climb across the month — steadier than a spike, and the stars weigh both.${monthText}`,
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
        headline: `${delta >= 0 ? "↑" : "↓"}${Math.abs(Math.round(delta))}% ${metricLabel(signal.metric_type)} ${deltaWindowLabel(signal.source)}`,
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
      headline: "Outside what you sell",
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

  // ---- competitor gap: only a real ad read can say the field is open.
  const gap = scored.components.competitorGap;
  if (scored.competitorBasis === "none") {
    insights.push({
      kind: "gap",
      headline: "Competition not measured yet",
      detail:
        "We haven't captured a usable Meta Ad Library read on this term near you — the score treats competition as unknown, not open. A national keyword total or local news mentions don't count as rivals.",
    });
  } else if (gap > 0.66) {
    insights.push({
      kind: "gap",
      headline: "Competitors haven't moved",
      detail:
        "We don't see many nearby businesses advertising this yet — early movers usually get cheaper clicks and own the idea.",
    });
  } else if (gap > 0.33) {
    insights.push({
      kind: "gap",
      headline: "Some competition",
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
      headline: "No results recorded yet",
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

/**
 * Three days into the week, but never today or earlier — "live by" a date
 * that has passed is a deadline nobody can meet. YYYY-MM-DD.
 */
export function launchByFor(week: string, now: number = Date.now()): string {
  const target = Math.max(new Date(`${week}T00:00:00Z`).getTime() + 3 * 86400_000, now + 86400_000);
  return new Date(target).toISOString().slice(0, 10);
}

/**
 * A week's creative test for an online brand, sized as a share of what it
 * already spends rather than a daily dollar figure. $25 a day is noise
 * against a $50K month; 5-10% of the band's floor is enough to read a hook
 * without betting the month on it. "under-20k" has no floor worth using, so
 * it reads against $10K; an unknown band says the share and no number.
 */
export function creativeTestBudgetFor(monthlyAdSpend: string | null | undefined): string {
  const floors: Record<string, number> = {
    "under-20k": 10_000,
    "20-50k": 20_000,
    "50-100k": 50_000,
    "100-250k": 100_000,
    "250k-plus": 250_000,
  };
  const floor = monthlyAdSpend ? floors[monthlyAdSpend] : undefined;
  if (!floor) return "5-10% of your monthly spend over one week";
  const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  return `${dollars(floor * 0.05)} to ${dollars(floor * 0.1)} over one week`;
}

/**
 * The "do this next" line is a move in the real world, never a chore about
 * using TRND. For a local business that's what to put on the counter, what
 * to quote, what to say. For an online brand it's a creative decision: which
 * product, which hook, what share of spend to test it with. The campaign
 * button sits right beside it; it doesn't need a second ad.
 */
export function buildNextAction(opts: {
  hasCampaign: boolean;
  launchBy: string; // e.g. "Aug 27"
  priceBand: string | null;
  /** This week's term, in the customer's words. */
  term?: string;
  /** The matched menu item and its price, when there is one. */
  serviceName?: string | null;
  servicePrice?: string | null;
  /** Online brands get creative moves and a share-of-spend test budget. */
  market?: BusinessMarket;
  monthlyAdSpend?: string | null;
}): NextAction {
  const term = opts.term ? `“${opts.term}”` : "this";
  if (opts.market === "online") {
    const test = creativeTestBudgetFor(opts.monthlyAdSpend);
    if (opts.hasCampaign) {
      return {
        label: `Put the three scripts in test by ${opts.launchBy}`,
        detail: `Run them against your current best ad at ${test}. Kill the two that lose on hook rate by day three and scale the one left.`,
      };
    }
    if (opts.serviceName) {
      return {
        label: `Make the next ad about ${opts.serviceName}, in the words people use: ${term}`,
        detail: `Open on the problem ${term} names, show ${opts.serviceName}${opts.servicePrice ? ` at ${opts.servicePrice}` : ""} in the first three seconds, and test it by ${opts.launchBy} at ${test}.`,
      };
    }
    return {
      label: `Pick the product that answers ${term} before you brief the ad`,
      detail: `An ad without a product to point at tests the idea, not the offer. Choose one, then test it by ${opts.launchBy} at ${test}.`,
    };
  }
  const budget = budgetFor(opts.priceBand);
  if (opts.hasCampaign) {
    return {
      label: `Get the ad live by ${opts.launchBy} at ${budget.daily}/day`,
      detail: `Copy-paste ready. Everyone who asks about ${term} this week hears the same offer the ad makes${opts.servicePrice ? ` — ${opts.serviceName} at ${opts.servicePrice}` : ""}.`,
    };
  }
  if (opts.serviceName) {
    return {
      label: `Quote ${opts.serviceName}${opts.servicePrice ? ` at ${opts.servicePrice}` : ""} to everyone asking about ${term}`,
      detail: `Put it where walk-ins see it first, price on it, this week. Then run the ad — live by ${opts.launchBy} at ${budget.daily}/day.`,
    };
  }
  return {
    label: `Name a price for ${term} before you advertise it`,
    detail: `A concrete offer is what makes the ad land. Then run it — live by ${opts.launchBy} at ${budget.daily}/day.`,
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
