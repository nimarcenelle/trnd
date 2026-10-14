import type { Brand } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/**
 * Two self-serve plans and an agency plan sold by hand. A new brand picks a
 * plan before its first scan, and the 14-day trial runs inside Stripe with a
 * card on file. Brands that started on the old card-free trial keep it until
 * it ends. Nothing locks when Stripe is not configured: with no way to pay,
 * everything runs.
 */

export type Tier = "starter" | "growth";

export interface PlanInfo {
  tier: Tier;
  name: string;
  price: number;
  /** Competitors watched, the brand itself not counted. */
  rivals: number;
  /** Hours between scheduled scans. */
  every: number;
  cadence: string;
  blurb: string;
  features: string[];
}

export const PLANS: Record<Tier, PlanInfo> = {
  starter: {
    tier: "starter",
    name: "Starter",
    price: 149,
    rivals: 3,
    every: 7 * 24,
    cadence: "weekly",
    blurb: "Your three closest competitors, read every week.",
    features: ["3 competitors", "A full scan and report every week", "Ads, websites and marketing emails", "Opportunities with campaign briefs"],
  },
  growth: {
    tier: "growth",
    name: "Growth",
    price: 399,
    rivals: 10,
    every: 24,
    cadence: "daily",
    blurb: "Your whole market, read every day.",
    features: ["10 competitors", "Daily scans, an email when something changes", "Ads, websites and marketing emails", "Instagram and TikTok tracking", "Opportunities with campaign briefs"],
  },
};

export const TRIAL_DAYS = 14;

/** Agencies get several brands and reports for their clients; sold by email for now. */
export const AGENCY = {
  name: "Agency",
  price: "From $1,200",
  blurb: "Several brands, one account, reports you can send to clients.",
  features: ["Every brand you manage", "10 competitors per brand, daily", "Reports with your name on them", "A direct line to us"],
  contact: "mailto:hello@usetrnd.com?subject=TRND%20for%20agencies",
};

export const priceLabel = (tier: Tier) => `$${PLANS[tier].price}/mo`;

/** "pro" is the old single plan, priced and limited like Growth. */
export function tierOf(plan: string): Tier {
  return plan === "starter" ? "starter" : "growth";
}

/** The Stripe price for a tier, or null when that tier isn't on sale here. */
export function stripePriceFor(tier: Tier): string | null {
  return (tier === "starter" ? env.stripePriceStarter : env.stripePriceGrowth) || null;
}

export function tierForPrice(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === env.stripePriceStarter) return "starter";
  if (priceId === env.stripePriceGrowth) return "growth";
  return null;
}

export interface PlanState {
  tier: Tier;
  /** A live subscription, including one still in its Stripe trial. */
  paid: boolean;
  /** Days left in a trial (Stripe's or the old card-free one); 0 when not trialing. */
  trialDaysLeft: number;
  /** Never subscribed: the brand has to pick a plan before its first scan. */
  needsPlan: boolean;
  locked: boolean;
}

export function planState(brand: Pick<Brand, "plan" | "plan_status" | "trial_ends_at" | "last_scan_at">, now = Date.now()): PlanState {
  const paid = brand.plan !== "trial" && brand.plan_status === "active";
  const trialDaysLeft = Math.max(0, Math.ceil((Date.parse(brand.trial_ends_at) - now) / 86_400_000));
  // The old trial needed no card; only brands that already scanned on it keep it.
  const oldTrial = brand.plan === "trial" && Boolean(brand.last_scan_at) && trialDaysLeft > 0;
  const needsPlan = isStripeConfigured && brand.plan === "trial" && !brand.last_scan_at;
  return {
    tier: tierOf(brand.plan),
    paid,
    trialDaysLeft: paid || oldTrial ? trialDaysLeft : 0,
    needsPlan,
    locked: isStripeConfigured && !paid && !oldTrial,
  };
}

/** Competitors this brand may watch. */
export function rivalLimit(brand: Pick<Brand, "plan">): number {
  return PLANS[tierOf(brand.plan)].rivals;
}
