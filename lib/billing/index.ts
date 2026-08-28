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
 * - Locked means: no new campaign builds. Everything already generated stays
 *   readable and exportable — the landing page promises "the campaigns you
 *   generated are yours", and the product keeps that promise.
 */

export const TRIAL_DAYS = 14;

export const PLAN_LABELS: Record<PlanId, string> = {
  trial: "Free trial",
  baseline: "TRND",
  pro: "TRND Pro",
};

export const PLAN_PRICES: Record<Exclude<PlanId, "trial">, string> = {
  baseline: "$250/mo",
  pro: "$500/mo",
};

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
      lockedReason = "Your free trial has ended — pick a plan to keep building campaigns.";
    } else if (sub.status === "canceled") {
      locked = true;
      lockedReason = "Your subscription ended — restart it to keep building campaigns.";
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
