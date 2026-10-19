import type { Creator } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * Two ways to pay for the same plan, weekly or monthly, after a 14-day trial.
 *
 * By default the trial starts when a card is on file (Stripe Checkout with a
 * trial period): before that an account sees its free preview plan, and the
 * daily reads don't run. TRIAL_REQUIRES_CARD=0 switches to the old model, a
 * trial without a card from sign-up. With Stripe not configured nothing locks.
 */
export type Interval = "weekly" | "monthly";

export const TRIAL_DAYS = 14;
export const cardFirst = process.env.TRIAL_REQUIRES_CARD !== "0";

export const PRICES: Record<Interval, { amount: string; per: string; label: string; note: string; perWeek: string }> = {
  weekly: { amount: "$9.99", per: "week", label: "$9.99/week", note: "Billed weekly", perWeek: "$9.99" },
  monthly: { amount: "$24.99", per: "month", label: "$24.99/month", note: "Billed monthly · 42% less than weekly", perWeek: "$5.77" },
};

/** The interval a paid plan is on, from creators.plan; null on a trial or an older "pro" row. */
export const intervalOf = (plan: string): Interval | null => (plan === "weekly" || plan === "monthly" ? plan : null);

export interface PlanState {
  /** A subscription that has started charging. */
  paid: boolean;
  /** The 14-day trial is running (with a card on file, in the default model). */
  trialing: boolean;
  trialDaysLeft: number;
  /** No more daily reads or new plans; the app shows the preview plan and asks to start the trial. */
  locked: boolean;
  /** Locked, and the free trial is still available to them. */
  canTrial: boolean;
}

type Billing = Pick<Creator, "plan" | "plan_status" | "trial_ends_at" | "trial_used_at">;

export function planState(c: Billing, now = Date.now()): PlanState {
  const subscribed = intervalOf(c.plan) !== null && (c.plan_status === "active" || c.plan_status === "trialing");
  const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000)) : 0);
  if (!isStripeConfigured) return { paid: false, trialing: false, trialDaysLeft: 0, locked: false, canTrial: false };
  if (cardFirst) {
    const trialing = subscribed && c.plan_status === "trialing";
    return { paid: subscribed && !trialing, trialing, trialDaysLeft: trialing ? daysLeft(c.trial_ends_at) : 0, locked: !subscribed, canTrial: !subscribed && !c.trial_used_at };
  }
  const left = daysLeft(c.trial_ends_at);
  return { paid: subscribed, trialing: !subscribed && left > 0, trialDaysLeft: subscribed ? 0 : left, locked: !subscribed && left === 0, canTrial: false };
}
