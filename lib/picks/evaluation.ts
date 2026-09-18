import { accountCostPerResultCents } from "./bet";
import { readAdHistory } from "@/lib/ads/history-read";
import type { AdHistory, Business, CampaignObjective, EvaluationPlan, PickBasis } from "@/lib/db/types";
import { creativeTestBudgetFor } from "@/lib/recommend/insights";
import type { TermMemory } from "@/lib/record/memory";

/**
 * How to judge a creative test, without a universal threshold.
 *
 * The old kill rule ("pause under 0.9% CTR at 2,000 impressions") was one
 * line for every brand, every objective and every budget. This builds the
 * plan from what is actually known: the campaign objective, the account's
 * own baseline when an export or a sync put one on file, the spend band,
 * and how many conversions the window can hold. Where something is
 * unknown, the plan says what is missing rather than inventing a number.
 */

const OBJECTIVE_METRIC: Record<CampaignObjective, { metric: string; unit: string }> = {
  purchases: { metric: "cost per purchase", unit: "purchase" },
  leads: { metric: "cost per lead", unit: "lead" },
  traffic: { metric: "cost per link click", unit: "click" },
  awareness: { metric: "cost per thousand impressions and hook rate", unit: "impression" },
};

/** Fewer results than this in a test window and a difference is noise. */
export const DIRECTIONAL_RESULTS = 50;

function money(cents: number): string {
  const d = cents / 100;
  return d >= 100 ? `$${Math.round(d).toLocaleString("en-US")}` : `$${d.toFixed(2).replace(/\.00$/, "")}`;
}

function dateRange(rows: AdHistory[]): string | null {
  const days = rows.flatMap((r) => [r.started_on, r.ended_on]).filter((d): d is string => typeof d === "string" && d.length >= 10).sort();
  if (days.length === 0) return null;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return days.length === 1 ? fmt(days[0]) : `${fmt(days[0])} to ${fmt(days[days.length - 1])}`;
}

export interface EvaluationInput {
  business: Pick<Business, "market" | "monthly_ad_spend" | "campaign_objectives" | "category">;
  history: AdHistory[];
  /** The concept's format, so the comparison names a like-for-like reference. */
  format: string;
}

function capital(s: string): string {
  return `${s[0].toUpperCase()}${s.slice(1)}`;
}

export function buildEvaluationPlan(input: EvaluationInput): EvaluationPlan {
  const { business, history } = input;
  const objectives = business.campaign_objectives ?? [];
  const read = history.length > 0 ? readAdHistory(history) : null;
  const perResult = accountCostPerResultCents(history);
  const resultsOnFile = history.reduce((n, r) => n + (r.results ?? 0), 0);
  const range = dateRange(history);

  const watch: string[] = [];
  const caveats: string[] = [];
  const missing: string[] = [];

  const conversionObjectives = objectives.filter((o) => o === "purchases" || o === "leads");
  const buysConversions = conversionObjectives.length > 0 || objectives.length === 0;
  if (objectives.length === 0) {
    missing.push("The campaign objective. Say whether these ads buy purchases, leads, traffic or reach (any that apply), and the plan can name the number that matters.");
  }

  // The comparison: the brand's own current best in the same format.
  let comparison: string;
  if (read && read.best.length > 0) {
    const best = read.best[0];
    const name = best.ad_name ?? best.campaign_name;
    comparison = `Run it beside your current best ad on the same objective (your export's top by click-through is "${name}") in the same ad set, same audience, same budget. Judge only against that, not against last month.`;
  } else {
    comparison = `Run it beside the ad you would otherwise keep spending on, in the same ad set, same audience, same budget. Judge only against that.`;
    missing.push("Your recent ad results. An Ads Manager export (Settings, Your past ads) gives the plan a real reference ad and your own baseline.");
  }

  // The budget: from the spend band, never a dollar figure the band cannot support.
  const budget = business.monthly_ad_spend
    ? `${creativeTestBudgetFor(business.monthly_ad_spend)}, split evenly with the reference ad.`
    : "5 to 10% of your monthly spend over one week, split evenly with the reference ad.";
  if (!business.monthly_ad_spend) missing.push("Your monthly ad spend band, so the test budget is sized to you.");

  // What to watch, in order, built from what is on file: one line per
  // objective. The export's cost per result is one figure for the whole
  // account, so it stands as a baseline only when one result type can own it.
  const baselineOwner = conversionObjectives.length === 1 ? conversionObjectives[0] : null;
  for (const objective of objectives) {
    const metric = OBJECTIVE_METRIC[objective];
    if (perResult !== null && objective === baselineOwner) {
      watch.push(`${capital(metric.metric)} against your account's ${money(perResult)} (from your export${range ? `, ${range}` : ""}).`);
    } else {
      watch.push(`${capital(metric.metric)}, against the reference ad in the same window${objectives.length > 1 ? `, in the ${metric.unit} campaign` : ""}.`);
    }
  }
  if (objectives.length === 0) {
    watch.push(
      perResult !== null
        ? `Cost per result against your account's ${money(perResult)} (from your export${range ? `, ${range}` : ""}). Say what the campaign optimizes for and this names the right result.`
        : "Cost per result for whatever the campaign optimizes for, against the reference ad in the same window.",
    );
  }
  watch.push("Hook rate (3-second views over impressions) and hold rate, to learn whether the opening worked even when the whole ad did not.");
  if (read?.accountCtr) {
    watch.push(`Click-through, against your account average of ${(read.accountCtr * 100).toFixed(2)}%. A higher click-through alone is not a win for a purchase campaign.`);
  } else {
    watch.push("Click-through, against the reference ad. A higher click-through alone is not a win for a purchase campaign.");
  }

  // Caveats the numbers carry.
  if (conversionObjectives.length > 1 && perResult !== null) {
    caveats.push("Your export's cost per result mixes purchase and lead campaigns, so it is not a baseline for either. Read each campaign against its own reference ad.");
  }
  if (buysConversions) {
    caveats.push(
      resultsOnFile > 0 && resultsOnFile < DIRECTIONAL_RESULTS * 4
        ? `Your export shows ${resultsOnFile} results in total, so a one-week test will hold fewer than ${DIRECTIONAL_RESULTS}. Read the result as directional, not final.`
        : `Under about ${DIRECTIONAL_RESULTS} results in the window, the difference between two ads is mostly noise. Read it as directional.`,
    );
    caveats.push("Purchases report late. Wait for the attribution window to close before calling it.");
  }
  if (objectives.includes("awareness")) {
    caveats.push(
      objectives.length > 1
        ? "In the reach campaign the test is judged on attention, not purchases. Do not read a purchase number into that leg."
        : "Reach campaigns are judged on attention, not purchases. Do not read a purchase number into this test.",
    );
  }
  caveats.push("The test is only comparable when the reference ad runs in the same ad set at the same time. A new ad against an old ad's history is not a comparison.");
  if (history.length > 0 && history.every((r) => r.results === null)) {
    caveats.push("Your export carries no results column, so the baseline is click-through only.");
  }

  return { objectives, comparison, budget, watch, caveats, missing };
}

/**
 * Whether the concept builds on something the brand already ran, or explores
 * new ground. Read from the brand's own record: a past run or pass on the
 * term, or ad history that names it.
 */
export function conceptBasis(input: { memory: TermMemory | undefined; historyOnTerm: number; ownBestTheme: boolean }): { basis: PickBasis; reason: string } {
  const runs = input.memory?.runs ?? [];
  const won = runs.find((r) => r.outcome === "won");
  if (won) return { basis: "builds_on", reason: "Builds on a test you ran on this that won." };
  const lost = runs.find((r) => r.outcome === "lost");
  if (lost) return { basis: "builds_on", reason: "A new angle on something you ran before that did not win. The angle changes; the topic stays." };
  if (runs.length > 0) return { basis: "builds_on", reason: "You have run this before without a recorded result." };
  if (input.historyOnTerm > 0) return { basis: "builds_on", reason: `Your ad history has ${input.historyOnTerm} ad${input.historyOnTerm === 1 ? "" : "s"} on this.` };
  if (input.ownBestTheme) return { basis: "builds_on", reason: "Uses the shape your best-performing ads share." };
  return { basis: "explores", reason: "New ground. Nothing on file says you have run this before." };
}

/** The gaps code knows about that the writer cannot: they go on every brief. */
export function structuralUnknowns(input: {
  history: AdHistory[];
  hasRecentCreative: boolean;
  hasClaimsNotes: boolean;
  rivalAdsRead: number;
  commentsRead: number;
}): string[] {
  const out: string[] = [];
  if (input.history.length === 0) out.push("No ad results on file, so nothing here is checked against what has worked for you.");
  if (!input.hasRecentCreative) out.push("No recent creative on file, so the difference from what you ran last is a guess.");
  if (!input.hasClaimsNotes) out.push("No claims notes on file. Check the facts used against what you may say.");
  if (input.rivalAdsRead === 0) out.push("No competitor ads were read this week, so the competitive read is from search and posts only.");
  if (input.commentsRead > 0 && input.commentsRead < 20) out.push(`Customer language comes from ${input.commentsRead} comments, a small sample.`);
  return out;
}
