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
 * - Locked means: no new week of briefs. Everything already written stays
 *   readable and exportable — the landing page promises the briefs are the
 *   customer's, and the product keeps that promise.
 */

export const TRIAL_DAYS = 14;

export const PLAN_LABELS: Record<PlanId, string> = {
  trial: "Free trial",
  baseline: "TRND",
  pro: "TRND Pro",
};

/**
 * One plan, priced against what it replaces rather than other tools: a
 * brand spending $50K a month on paid social isn't weighing $500, it's
 * weighing $50K behind a mediocre ad. One incremental winner pays for a
 * year. Founding brands lock the price. The "pro" id survives for
 * subscriptions that already carry it and so the Stripe seam still
 * compiles; it is not sold, and it prints the same price as the one plan.
 * The Stripe price itself is an env var (STRIPE_PRICE_BASELINE), never an
 * id in code.
 */
export const PLAN_PRICES: Record<Exclude<PlanId, "trial">, string> = {
  baseline: "$500/mo",
  pro: "$500/mo",
};

/** Annual, two months free — the same numbers the landing page prints. */
export const PLAN_PRICES_ANNUAL: Record<Exclude<PlanId, "trial">, string> = {
  baseline: "$5,000/yr",
  pro: "$5,000/yr",
};

/** What the pilot delivers, one list, printed everywhere the plan is described. */
export const BASELINE_FEATURES = [
  "Up to three creative test briefs a week: the concept, the hypothesis, the hook, the direction, the shot list and the facts you may use",
  "The evidence behind each one, with its source, its date, its sample and what it cannot say",
  "Your direct competitors' ads and posts read weekly, quoted as observed, never as proof",
  "Your own results read from an Ads Manager export, so briefs build on what you ran and never repeat what failed",
  "A founder reads every brief before it reaches you during the pilot",
  "Continuity: what you chose, launched, learned and passed on shapes the next week",
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
      lockedReason = "Your free trial has ended — pick a plan to keep the weekly creative tests coming.";
    } else if (sub.status === "canceled") {
      locked = true;
      lockedReason = "Your subscription ended — restart it to keep the weekly creative tests coming.";
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
