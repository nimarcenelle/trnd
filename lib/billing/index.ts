import type { Creator } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

/**
 * Four tiers. Free needs no card: the numbers, the creators ahead, what's
 * rising, and one scripted idea a week. Creator is the paid plan, monthly or
 * yearly (yearly is the default everywhere: it is the main churn control).
 * Pro and Business are listed at their prices but sold only once their
 * features ship; until then they take a waitlist (`available: false`).
 *
 * A paid plan is stored in creators.plan as "<tier>_<period>". Subscribers from
 * before this pricing ("weekly", "monthly") keep their plan and count as Creator.
 *
 * No trial by default: the free tier is the on-ramp and paid plans carry a
 * 14-day refund. CREATOR_TRIAL_DAYS turns a card-first trial back on;
 * TRIAL_REQUIRES_CARD=0 is the older no-card trial from sign-up. With Stripe
 * not configured nothing locks.
 */
export type Tier = "creator" | "pro" | "business";
export type Period = "month" | "year";

export interface TierInfo {
  name: string;
  month: number;
  year: number;
  blurb: string;
  features: string[];
  /** Sold now. False: the card shows the waitlist instead of checkout. */
  available: boolean;
}

export const FREE = {
  name: "Free",
  blurb: "See the gap and try one idea a week.",
  features: ["Your numbers and typical views", "Creators ahead of you", "Rising trends in your niche", "One scripted idea a week, with why it works"],
};

export const TIERS: Record<Tier, TierInfo> = {
  creator: {
    name: "Creator",
    month: 19,
    year: 149,
    blurb: "Three scripts a week, checked after you post.",
    features: ["Three scripted videos every week", "Hook, script, sound, hashtags and post time", "48-hour check on every idea you post", "3 creators to emulate"],
    available: true,
  },
  pro: {
    name: "Pro",
    month: 49,
    year: 390,
    blurb: "A plan every day, and alerts when rivals break out.",
    features: ["Everything in Creator", "A new plan every day", "Unlimited creators to emulate", "Competitor alerts", "Up to 3 accounts", "Scripts written in your voice"],
    available: false,
  },
  business: {
    name: "Business",
    month: 129,
    year: 990,
    blurb: "Scripts built around what you sell.",
    features: ["Everything in Pro", "Your products, offers and location", "Scripts built around your products", "Local competitor read", "Up to 5 accounts"],
    available: false,
  },
};

export const TIER_ORDER: Tier[] = ["creator", "pro", "business"];

/** One-time add-ons, fulfilled by hand: no new pipeline. */
export const ADDONS = {
  script_pack: { name: "Script pack", price: 19, blurb: "10 scripts for a launch, trip or holiday." },
  done_for_you: { name: "Done-for-you month", price: 79, blurb: "12 scripts and a posting calendar, as a PDF. Made for businesses." },
} as const;
export type Addon = keyof typeof ADDONS;

export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
/** "$149/yr vs $228 billed monthly". */
export const yearlyVsMonthly = (t: Tier) => `${money(TIERS[t].year)}/yr vs ${money(TIERS[t].month * 12)} billed monthly`;
/** The yearly price as a month, rounded down to the cent: "$12.41". */
export const yearlyPerMonth = (t: Tier) => money(Math.floor((TIERS[t].year / 12) * 100) / 100);

export const planKey = (tier: Tier, period: Period) => `${tier}_${period}`;

/** The paid plan a creators.plan value names; null on the free plan. Old weekly and monthly plans are Creator. */
export function paidPlanOf(plan: string): { tier: Tier; period: Period | "week"; legacy: boolean } | null {
  if (plan === "weekly") return { tier: "creator", period: "week", legacy: true };
  if (plan === "monthly" || plan === "pro") return { tier: "creator", period: "month", legacy: true };
  const m = /^(creator|pro|business)_(month|year)$/.exec(plan);
  return m ? { tier: m[1] as Tier, period: m[2] as Period, legacy: false } : null;
}

/** What a paid plan reads as in Settings and emails: "Creator · $149/year". Old plans show what they pay. */
export function planLabel(plan: string): string {
  const p = paidPlanOf(plan);
  if (!p) return "Free";
  if (p.legacy) return plan === "weekly" ? "Creator · $9.99/week" : "Creator · $24.99/month";
  const t = TIERS[p.tier];
  return `${t.name} · ${money(p.period === "year" ? t.year : t.month)}/${p.period}`;
}

export const TRIAL_DAYS = Math.max(0, Number(process.env.CREATOR_TRIAL_DAYS) || 0);
export const cardFirst = process.env.TRIAL_REQUIRES_CARD !== "0";

/** The interval a paid plan is on, from creators.plan; null on the free plan. */
export const intervalOf = (plan: string): string | null => paidPlanOf(plan)?.period ?? null;

export interface PlanState {
  /** A subscription that has started charging. */
  paid: boolean;
  /** The 14-day trial is running (with a card on file, in the default model). */
  trialing: boolean;
  trialDaysLeft: number;
  /** On the free tier: a weekly read, one idea unlocked, and the paid plans on offer. */
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
    return { paid: subscribed && !trialing, trialing, trialDaysLeft: trialing ? daysLeft(c.trial_ends_at) : 0, locked: !subscribed, canTrial: TRIAL_DAYS > 0 && !subscribed && !c.trial_used_at, pastDue };
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

