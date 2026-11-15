/**
 * What Admitted sells. One list, read by every price on the site and by checkout, so a page can never
 * show a price Stripe doesn't charge.
 */
export type PlanId = "monthly" | "season";

export type Plan = {
  id: PlanId;
  name: string;
  cents: number;
  /** Stripe recurring interval: every `months` months. */
  months: number;
  price: string;
  per: string;
  billed: string;
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: "monthly", name: "Monthly", cents: 2900, months: 1, price: "$29", per: "a month", billed: "Renews monthly. Cancel anytime." },
  season: { id: "season", name: "Season pass", cents: 9900, months: 6, price: "$99", per: "for 6 months", billed: "$16.50 a month. Renews every 6 months. Cancel anytime." },
};

export const parsePlan = (value: unknown): PlanId => (value === "monthly" ? "monthly" : "season");

/** Free, no card and no account. */
export const FREE_FEATURES = ["Odds at every school, with sources", "One full essay review: score and line-by-line fixes", "Activity and honors list reviews", "Essay prompts for every school we cover"];

/** Both paid plans get the same thing; they differ only in how they bill. */
export const PAID_FEATURES = ["Unlimited essay reviews", "Rewrites in your voice, from your own details", "Every revision re-scored", "Final Read: every essay checked before you submit"];
