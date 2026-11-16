/**
 * What EssayOdds sells: the RD Pass, one payment through January 15, and the weekly plan, a $19 weekly subscription. One list, read by every price on the site and by checkout,
 * so a page can never show a price Stripe doesn't charge.
 *
 * Priced for the regular-decision crunch (Nick, 2026-11-16: "make the pricing make sense"): the RD Pass covers every
 * January deadline for less than two months of a $29/month rival; Weekly ($19 a week, a subscription) is for starting small, and
 * makes the RD Pass the obvious buy for anyone with more. After January 15 the RD Pass needs a new end date or a new plan.
 */
export type PlanId = "rd" | "week";

export type Plan = {
  id: PlanId;
  /** Billed again every week until cancelled. Absent for a one-time pass. */
  recurring?: "week";
  name: string;
  cents: number;
  price: string;
  per: string;
  /** The line under the price. */
  billed: string;
  /** The plan in a few words, for one-line mentions. */
  short: string;
  cta: string;
};

/** End of January 15 in New York: the RD Pass covers January 1 and January 15 deadlines. */
export const RD_PASS_ENDS = new Date("2027-01-16T05:00:00Z");
const WEEK = 7 * 86_400_000;

export const PLANS: Record<PlanId, Plan> = {
  rd: { id: "rd", name: "RD Pass", cents: 5900, price: "$59", per: "one time", billed: "Everything until January 15. No subscription, nothing to cancel.", short: "$59 once, through January 15", cta: "Get the RD Pass" },
  week: { id: "week", name: "Weekly", cents: 1900, price: "$19", per: "a week", billed: "Renews weekly. Cancel anytime from your account.", short: "$19 a week", cta: "Start weekly", recurring: "week" },
};

export const parsePlan = (value: unknown): PlanId => (value === "week" ? "week" : "rd");

/** When a pass bought at `bought` stops working. An RD Pass bought late still gets a full week. */
export function accessUntil(plan: PlanId, bought: Date): Date {
  const week = new Date(bought.getTime() + WEEK);
  return plan === "week" ? week : new Date(Math.max(RD_PASS_ENDS.getTime(), week.getTime()));
}

/** Both passes get the same thing; they differ only in how long. */
export const PAID_FEATURES = ["Your essay scored, every weak line marked", "Rewrites in your voice, from your own details", "Every supplement and revision, unlimited", "Activity and honors lists tightened", "Final Read: everything checked before you submit"];
