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
  starter: "Starter",
  baseline: "TRND",
  pro: "Scale",
};

/**
 * Three plans on access, metered on the three things a team feels: briefs
 * a week, rivals tracked, seats. The brand's own history classified by
 * angle and the rival ad library are in every plan; they are what keeps a
 * team coming back. "baseline" is the pilot tier and the one the landing
 * page features. Founding brands lock their price for a year. Each Stripe
 * price is an env var (STRIPE_PRICE_*), never an id in code.
 */
export const PLAN_PRICES: Record<Exclude<PlanId, "trial">, string> = {
  starter: "$250/mo",
  baseline: "$500/mo",
  pro: "$1,000/mo",
};

/** Annual, two months free — the same numbers the landing page prints. */
export const PLAN_PRICES_ANNUAL: Record<Exclude<PlanId, "trial">, string> = {
  starter: "$2,500/yr",
  baseline: "$5,000/yr",
  pro: "$10,000/yr",
};

export interface PlanLimits {
  /** Creative test briefs written each Monday. */
  briefsPerWeek: number;
  /** Competitors whose ads and posts are read weekly. */
  rivals: number;
  /** People on the roster besides the owner. */
  seats: number;
}

/** The trial runs on the pilot tier's limits. */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: { briefsPerWeek: 3, rivals: 10, seats: 3 },
  starter: { briefsPerWeek: 1, rivals: 3, seats: 1 },
  baseline: { briefsPerWeek: 3, rivals: 10, seats: 3 },
  pro: { briefsPerWeek: 5, rivals: 25, seats: 10 },
};

export function planLimits(plan: PlanId | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan ?? "trial"] ?? PLAN_LIMITS.trial;
}

export interface PlanTier {
  id: Exclude<PlanId, "trial">;
  name: string;
  price: string;
  annual: string;
  /** Who it is for, one line. */
  who: string;
  /** What the meter says, printed as the first lines of the list. */
  meter: string[];
  featured?: boolean;
  badge?: string;
}

/** The three tiers as the landing page and Settings print them. */
export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    name: PLAN_LABELS.starter,
    price: PLAN_PRICES.starter,
    annual: PLAN_PRICES_ANNUAL.starter,
    who: "One brief a week for a founder who is the creative team.",
    meter: ["One creative test brief every Monday", "Three competitors read weekly", "One seat"],
  },
  {
    id: "baseline",
    name: PLAN_LABELS.baseline,
    price: PLAN_PRICES.baseline,
    annual: PLAN_PRICES_ANNUAL.baseline,
    who: "The Monday agenda for a brand with an in-house creative process.",
    meter: ["Up to three briefs every Monday", "Ten competitors read weekly", "Three seats: the buyer, the strategist, the creator"],
    featured: true,
    badge: "The pilot tier",
  },
  {
    id: "pro",
    name: PLAN_LABELS.pro,
    price: PLAN_PRICES.pro,
    annual: PLAN_PRICES_ANNUAL.pro,
    who: "For a team testing across several products at once.",
    meter: ["Up to five briefs every Monday", "Twenty-five competitors read weekly", "Ten seats"],
  },
];

/** What every plan carries, one list, printed everywhere a plan is described. */
export const BASELINE_FEATURES = [
  "Each brief: the concept, the hypothesis, the hook, the first three seconds shot by shot, the direction, the shot list and the facts you may use",
  "The evidence behind each one, with its source, its date, its sample and what it cannot say",
  "Your competitors' ads and posts read weekly, quoted as observed, never as proof",
  "Every ad you ever ran, classified by angle, with what each angle does for you on cost per purchase",
  "A test checked against its brief, so the record says whether the idea or the shoot lost",
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
