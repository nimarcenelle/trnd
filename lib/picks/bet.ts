import { readAdHistory } from "@/lib/ads/history-read";
import type { AdHistory, Business, BrandPick } from "@/lib/db/types";
import { budgetFor, creativeTestDailyCents } from "@/lib/recommend/insights";
import { benchmarkFor } from "@/lib/results/benchmarks";
import { isOnlineBusiness } from "@/lib/signals/geo";

/**
 * The bet: what it costs, how long it runs, and the number that ends it.
 * Computed, never written by a model, because a kill rule is only useful if
 * it is a threshold someone can check in Ads Manager on day three.
 */

export type PickBet = Pick<BrandPick, "bet_budget_usd" | "bet_duration_days" | "bet_kill_rule">;

export const ONLINE_TEST_DAYS = 5;
/** budgetFor's test is a six-day flight; the local bet runs the same length. */
export const LOCAL_TEST_DAYS = 6;
export const KILL_OVER_AVERAGE_PCT = 30;
export const KILL_BY_DAY = 3;
/** A brand that skipped the spend question is read at the lowest band. The
 * smallest test that reads a hook beats no number at all. */
const DEFAULT_SPEND_BAND = "under-20k";
const LOCAL_DAILY_FALLBACK_USD = 25;

/**
 * An online brand's test: 5% of its monthly spend band's floor, the low end
 * of the range `creativeTestBudgetFor` prints. Derived from
 * `creativeTestDailyCents` (that share spread over seven days) so the band
 * floors live in one place.
 */
export function onlineTestBudgetUsd(monthlyAdSpend: string | null | undefined): number {
  const daily = creativeTestDailyCents(monthlyAdSpend) ?? creativeTestDailyCents(DEFAULT_SPEND_BAND) ?? 0;
  return Math.round((daily * 7) / 100);
}

/** The low end of the price band's daily range: "$25–50" is 25. */
export function localDailyUsd(priceBand: string | null | undefined): number {
  const m = budgetFor(priceBand ?? null).daily.match(/\$(\d+)/);
  return m ? Number(m[1]) : LOCAL_DAILY_FALLBACK_USD;
}

/** "$42", "$1.20", "$0.85". Whole dollars past $100: nobody reads cents there. */
function money(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 100) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  return `$${dollars.toFixed(2).replace(/\.00$/, "")}`;
}

/** Spend over reported results, across the rows that carry both. */
export function accountCostPerResultCents(rows: AdHistory[]): number | null {
  let spend = 0;
  let results = 0;
  for (const r of rows) {
    if (r.spend_cents === null || !r.results || r.results <= 0) continue;
    spend += r.spend_cents;
    results += r.results;
  }
  return results > 0 && spend > 0 ? Math.round(spend / results) : null;
}

/**
 * The kill rule, best evidence first. The account's own cost per result is
 * the number the buyer already manages to; cost per click is next when the
 * export has no results column; with no history at all, the category's
 * click-through benchmark is the only honest line to draw.
 */
export function killRuleFor(
  business: Pick<Business, "market" | "category">,
  history: AdHistory[],
): string {
  const tail = `${KILL_OVER_AVERAGE_PCT}% over your account average`;
  const perResult = accountCostPerResultCents(history);
  if (perResult !== null) {
    // Online brands optimize for purchases; a local account's results are
    // bookings, calls and messages, which Ads Manager calls results.
    const unit = isOnlineBusiness(business) ? "purchase" : "result";
    return `Kill if cost per ${unit} runs ${tail} (${money(perResult)}) by day ${KILL_BY_DAY}`;
  }
  const cpc = history.length > 0 ? readAdHistory(history).accountCpcCents : null;
  if (cpc !== null && cpc > 0) {
    return `Kill if cost per click runs ${tail} (${money(cpc)}) by day ${KILL_BY_DAY}`;
  }
  const pct = (benchmarkFor(business.category) * 100).toFixed(1).replace(/\.0$/, "");
  return `Kill if click-through is under ${pct}% after day ${KILL_BY_DAY}`;
}

export function pickBet(
  business: Pick<Business, "market" | "category" | "monthly_ad_spend" | "price_band">,
  history: AdHistory[],
): PickBet {
  if (isOnlineBusiness(business)) {
    return {
      bet_budget_usd: onlineTestBudgetUsd(business.monthly_ad_spend),
      bet_duration_days: ONLINE_TEST_DAYS,
      bet_kill_rule: killRuleFor(business, history),
    };
  }
  return {
    bet_budget_usd: localDailyUsd(business.price_band) * LOCAL_TEST_DAYS,
    bet_duration_days: LOCAL_TEST_DAYS,
    bet_kill_rule: killRuleFor(business, history),
  };
}
