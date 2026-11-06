import "server-only";

import Stripe from "stripe";

import type { Creator } from "@/lib/db/types";
import { type Addon, cardFirst, carriedTrialEnd, planKey, type Period, TRIAL_DAYS } from "@/lib/billing";
import { env, isStripeConfigured } from "@/lib/env";
import { FREE_MONTH_DAYS, freeMonthFor } from "@/lib/referrals";

/** The only file that imports the Stripe SDK. */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY, STRIPE_PRICE_CREATOR_MONTHLY and STRIPE_PRICE_CREATOR_YEARLY.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

/** The Creator plan, monthly or yearly. Pro and Business aren't sold yet (lib/billing TIERS). */
export async function createCheckoutSession(creator: Creator, email: string, period: Period): Promise<string> {
  const plan = planKey("creator", period);
  // A referral's free month: the referee's own, or a month the creator earned by referring.
  const free = freeMonthFor(creator);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: period === "year" ? env.stripePriceCreatorYearly : env.stripePriceCreatorMonthly, quantity: 1 }],
    client_reference_id: creator.id,
    ...(creator.stripe_customer_id ? { customer: creator.stripe_customer_id } : { customer_email: email }),
    metadata: { creator_id: creator.id, plan, free_month: free ?? "" },
    // A card-first trial only when CREATOR_TRIAL_DAYS is set, once per creator; a referral's free month is a 30-day one.
    // No-card trial (TRIAL_REQUIRES_CARD=0): a plan picked during it starts charging when it ends, so no free day is lost.
    subscription_data: {
      metadata: { creator_id: creator.id, plan },
      ...(free ? { trial_period_days: FREE_MONTH_DAYS } : cardFirst && TRIAL_DAYS > 0 && !creator.trial_used_at ? { trial_period_days: TRIAL_DAYS } : {}),
      ...(!cardFirst && carriedTrialEnd(creator) ? { trial_end: carriedTrialEnd(creator)! } : {}),
    },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/app?welcome=1`,
    cancel_url: `${env.siteUrl}/app/welcome?step=trial`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

const ADDON_PRICE: Record<Addon, () => string> = { script_pack: () => env.stripePriceScriptPack, done_for_you: () => env.stripePriceDoneForYou };

export const isAddonForSale = (a: Addon) => Boolean(env.stripeSecretKey && ADDON_PRICE[a]());

/** A one-time add-on. Paid, the webhook emails the team to make it and the buyer to say when. */
export async function createAddonCheckout(creator: Creator, email: string, addon: Addon): Promise<string> {
  client ??= new Stripe(env.stripeSecretKey);
  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: ADDON_PRICE[addon](), quantity: 1 }],
    client_reference_id: creator.id,
    ...(creator.stripe_customer_id ? { customer: creator.stripe_customer_id } : { customer_email: email, customer_creation: "always" as const }),
    metadata: { creator_id: creator.id, addon },
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/app/settings?addon=${addon}#add-ons`,
    cancel_url: `${env.siteUrl}/app/settings#add-ons`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: `${env.siteUrl}/app/settings` });
  return session.url;
}

/** The referrer's free month when they already pay: a 100%-off month on their subscription. False when it can't be applied. */
export async function applyFreeMonth(subscriptionId: string): Promise<boolean> {
  if (!env.stripeCouponFreeMonth) return false;
  try {
    await getStripe().subscriptions.update(subscriptionId, { discounts: [{ coupon: env.stripeCouponFreeMonth }] });
    return true;
  } catch (e) {
    console.warn("[referral] coupon:", (e as Error).message);
    return false;
  }
}
