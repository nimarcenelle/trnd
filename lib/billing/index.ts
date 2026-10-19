import type { Creator } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * One plan. Every creator starts a 14-day trial; Stripe's webhook turns it into
 * a paid plan. A creator is locked (no more scans) only once its trial ends with
 * no paid plan, and only when Stripe is configured: with no way to pay, nothing
 * locks.
 */
export const PRICE_LABEL = "$19/mo";

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
