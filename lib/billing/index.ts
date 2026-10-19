import type { Creator } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * Two ways to pay for the same plan, weekly or monthly. Every creator starts a
 * 14-day trial; Stripe's webhook turns it into a paid plan. A creator is locked (no more scans) only once its trial ends with
 * no paid plan, and only when Stripe is configured: with no way to pay, nothing
 * locks.
 */
export type Interval = "weekly" | "monthly";

export const PRICES: Record<Interval, { amount: string; per: string; label: string; note: string }> = {
  weekly: { amount: "$9.99", per: "week", label: "$9.99/week", note: "Try it for a week at a time" },
  monthly: { amount: "$24.99", per: "month", label: "$24.99/month", note: "Save 42% against weekly" },
};

/** The interval a paid plan is on, from creators.plan; null on a trial or an older "pro" row. */
export const intervalOf = (plan: string): Interval | null => (plan === "weekly" || plan === "monthly" ? plan : null);

export interface PlanState {
  paid: boolean;
  trialDaysLeft: number;
  locked: boolean;
}

export function planState(c: Pick<Creator, "plan" | "plan_status" | "trial_ends_at">, now = Date.now()): PlanState {
  const paid = c.plan !== "trial" && c.plan_status === "active";
  const trialDaysLeft = Math.max(0, Math.ceil((Date.parse(c.trial_ends_at) - now) / 86_400_000));
  return { paid, trialDaysLeft, locked: isStripeConfigured && !paid && trialDaysLeft === 0 };
}
