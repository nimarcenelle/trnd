import type { Brand } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * One plan. Every brand starts a 14-day trial; Stripe's webhook turns it into
 * a paid plan. A brand is locked (no more scans) only once its trial ends with
 * no paid plan, and only when Stripe is configured: with no way to pay, nothing
 * locks.
 */
export const PRICE_LABEL = "$500/mo";

export interface PlanState {
  paid: boolean;
  trialDaysLeft: number;
  locked: boolean;
}

export function planState(brand: Pick<Brand, "plan" | "plan_status" | "trial_ends_at">, now = Date.now()): PlanState {
  const paid = brand.plan !== "trial" && brand.plan_status === "active";
  const trialDaysLeft = Math.max(0, Math.ceil((Date.parse(brand.trial_ends_at) - now) / 86_400_000));
  return { paid, trialDaysLeft, locked: isStripeConfigured && !paid && trialDaysLeft === 0 };
}
