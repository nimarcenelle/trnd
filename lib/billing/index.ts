import type { Repo } from "@/lib/db/repo";
import type { Business, PlanId, Subscription, SubscriptionStatus } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * Plan state in one place. Semantics, deliberately simple:
 *
 * - Every business starts a 14-day trial the moment it's created (row written
 *   at onboarding; lazily backfilled from business.created_at for businesses
 *   that predate billing).
 * - Stripe webhooks flip the row to a paid plan. Nothing client-side can.
 * - LOCKING only happens when Stripe is actually configured. Without keys
 *   there is no way to pay, so an expired "trial" stays usable and the UI
 *   says billing isn't connected — a demo install never bricks itself.
 * - Locked means: this week's call is walled, and no new campaign builds.
 *   The wall keeps the finding and the grade visible and hides the bet, the
 *   scripts and the evidence — enough to see there is a call, not enough to
 *   run it. Gating only the build was a hole: the pick IS the product, so a
 *   lapsed trial kept receiving the thing it had stopped paying for.
 * - Everything already generated stays readable and exportable — the landing
 *   page promises "the campaigns you generated are yours", and the product
 *   keeps that promise. The wall never reaches a built campaign.
 */

export const TRIAL_DAYS = 14;

export const PLAN_LABELS: Record<PlanId, string> = {
  trial: "Free trial",
  baseline: "TRND",
  pro: "TRND Pro",
};

/**
 * Pricing, in one place. Everything that prints a price reads these — the
 * landing page, the settings panel and the terms.
 *
 * Two rates, because the product has no track record yet. A brand cannot
 * check TRND's calls against anyone else's results, so the founding rate
 * buys the first ten brands' patience, and the guarantee below carries the
 * risk that the proof normally would. The standard rate is what the product
 * is worth once that proof exists; brands who join early keep the founding
 * rate for as long as their subscription runs.
 *
 * The Stripe price itself is an env var (STRIPE_PRICE_BASELINE), never an id
 * in code. Point it at the founding price now and at the standard price when
 * the cohort closes; nothing here changes.
 */
export const FOUNDING_SEATS = 10;

export const FOUNDING_PRICE = "$250/mo";
export const FOUNDING_PRICE_ANNUAL = "$2,500/yr";
export const STANDARD_PRICE = "$500/mo";
export const STANDARD_PRICE_ANNUAL = "$5,000/yr";

/**
 * The guarantee. It replaces the case study the product cannot show yet: the
 * brand risks one month, and only after it has actually run a call. Honour it
 * by hand in Stripe — an automated refund path would need a results feed that
 * only exists for connected Meta accounts.
 */
export const GUARANTEE_DAYS = 30;
export const GUARANTEE =
  "Run a TRND call in your first 30 days. If it does not beat your own trailing median cost per result, the month is refunded.";

/** What the plan costs today. "pro" is legacy and prints the standard rate. */
export const PLAN_PRICES: Record<Exclude<PlanId, "trial">, string> = {
  baseline: FOUNDING_PRICE,
  pro: STANDARD_PRICE,
};

/** Annual, two months free — the same numbers the landing page prints. */
export const PLAN_PRICES_ANNUAL: Record<Exclude<PlanId, "trial">, string> = {
  baseline: FOUNDING_PRICE_ANNUAL,
  pro: STANDARD_PRICE_ANNUAL,
};

/** What the plan buys — one list, printed everywhere the plan is described. */
export const BASELINE_FEATURES = [
  "The next ad to run, every week: the product, the angle, the format, the audience, and three scripts to test",
  "The four signals behind it, customer, culture, competition and your brand, with every number linked to its source",
  "Your direct competitors' Meta and TikTok ads and posts, read daily, with what's saturated and what they left open",
  "Learns from your Meta ad account and past exports, so the next call leans on what actually performed for you",
  "The Monday brief in your inbox before your creative standup",
  "Your founding analysis: positioning, target customer, what they search and say, and what never to run",
] as const;

export interface PlanState {
  plan: PlanId;
  status: SubscriptionStatus;
  subscription: Subscription;
  isTrialing: boolean;
  /** Whole days left on the trial, never negative. */
  trialDaysLeft: number;
  /** True when campaign building is gated behind an upgrade. */
  locked: boolean;
  /** Why locked, in one plain sentence — null when not locked. */
  lockedReason: string | null;
}

export function trialEndsAtFor(business: Pick<Business, "created_at">): string {
  return new Date(
    new Date(business.created_at).getTime() + TRIAL_DAYS * 86400_000,
  ).toISOString();
}

/** Read (and lazily create) the subscription row for a business. */
export async function getOrCreateSubscription(
  repo: Repo,
  business: Business,
): Promise<Subscription> {
  const existing = await repo.getSubscription(business.id);
  if (existing) return existing;
  return repo.upsertSubscription({
    business_id: business.id,
    plan: "trial",
    status: "trialing",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    trial_ends_at: trialEndsAtFor(business),
  });
}

export function derivePlanState(
  sub: Subscription,
  now = new Date(),
  billingLive = isStripeConfigured,
): PlanState {
  const isTrialing = sub.plan === "trial";
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400_000))
    : 0;

  let locked = false;
  let lockedReason: string | null = null;
  if (billingLive) {
    if (isTrialing && trialEnd && trialEnd.getTime() <= now.getTime()) {
      locked = true;
      lockedReason = "Your free trial has ended — pick a plan to see this week's call.";
    } else if (sub.status === "canceled") {
      locked = true;
      lockedReason = "Your subscription ended — restart it to see this week's call.";
    }
    // past_due keeps working: Stripe retries the card; cutting the product
    // off during a bank hiccup churns customers who meant to pay.
  }

  return {
    plan: sub.plan,
    status: sub.status,
    subscription: sub,
    isTrialing,
    trialDaysLeft,
    locked,
    lockedReason,
  };
}

export async function getPlanState(repo: Repo, business: Business): Promise<PlanState> {
  return derivePlanState(await getOrCreateSubscription(repo, business));
}
