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
  /** A charge failed and Stripe is retrying it: the plan keeps running while they update their card. */
  pastDue: boolean;
}

type Billing = Pick<Creator, "plan" | "plan_status" | "trial_ends_at" | "trial_used_at">;

export function planState(c: Billing, now = Date.now()): PlanState {
  // past_due is a grace period: Stripe retries the charge for a while, then cancels (or marks it unpaid, which we record as canceled).
  const pastDue = intervalOf(c.plan) !== null && c.plan_status === "past_due";
  const subscribed = intervalOf(c.plan) !== null && (c.plan_status === "active" || c.plan_status === "trialing" || pastDue);
  const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000)) : 0);
  if (!isStripeConfigured) return { paid: false, trialing: false, trialDaysLeft: 0, locked: false, canTrial: false, pastDue: false };
  if (cardFirst) {
    const trialing = subscribed && c.plan_status === "trialing";
    return { paid: subscribed && !trialing, trialing, trialDaysLeft: trialing ? daysLeft(c.trial_ends_at) : 0, locked: !subscribed, canTrial: !subscribed && !c.trial_used_at, pastDue };
  }
  const left = daysLeft(c.trial_ends_at);
  return { paid: subscribed, trialing: !subscribed && left > 0, trialDaysLeft: subscribed ? 0 : left, locked: !subscribed && left === 0, canTrial: false, pastDue };
}

/** The reminder goes out this long before a no-card trial ends. */
export const REMIND_BEFORE_MS = 2 * 86_400_000;

type Remind = Billing & Pick<Creator, "trial_reminder_for">;

/**
 * Whether a no-card trial is due its "your trial ends soon" email: no plan picked,
 * the trial ending within two days, and not reminded for this end date yet. A
 * card-on-file trial is reminded by Stripe's trial_will_end instead.
 */
export function trialReminderDue(c: Remind, now = Date.now()): boolean {
  if (cardFirst || !isStripeConfigured || intervalOf(c.plan) !== null) return false;
  const end = Date.parse(c.trial_ends_at);
  if (Number.isNaN(end) || end <= now || end - now > REMIND_BEFORE_MS) return false;
  return !c.trial_reminder_for || Date.parse(c.trial_reminder_for) !== end;
}

/**
 * When a plan picked during a no-card trial starts charging: at the trial's end, so
 * the free days left aren't lost. Null (charge now) when there is no trial left
 * worth keeping; Stripe needs a trial end at least 48 hours away.
 */
export function carriedTrialEnd(c: Pick<Creator, "trial_ends_at">, now = Date.now()): number | null {
  if (cardFirst) return null;
  const end = Date.parse(c.trial_ends_at);
  return !Number.isNaN(end) && end - now > 48 * 3_600_000 ? Math.floor(end / 1000) : null;
}

