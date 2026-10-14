import "server-only";

import Stripe from "stripe";

import { stripePriceFor, tierForPrice, TRIAL_DAYS, type Tier } from "@/lib/billing";
import type { Brand } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/** The only file that imports the Stripe SDK. */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY and STRIPE_PRICE_GROWTH.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

/**
 * A brand that has never subscribed gets the trial inside Stripe: the card is
 * taken now and charged when the trial ends. Back from Checkout, /app/start
 * turns the plan on and starts the first scan.
 */
export async function createCheckoutSession(brand: Brand, email: string, tier: Tier, from: "setup" | "settings"): Promise<string> {
  const price = stripePriceFor(tier);
  if (!price) throw new Error(`No Stripe price is set for the ${tier} plan.`);
  // New brands get the full trial; brands still on the old card-free trial keep the days they have left
  // (Stripe needs a trial to end at least 48 hours out).
  const fresh = !brand.stripe_subscription_id && brand.plan === "trial";
  const left = Date.parse(brand.trial_ends_at) - Date.now();
  const trial = !fresh ? {} : !brand.last_scan_at ? { trial_period_days: TRIAL_DAYS } : left > 2 * 86_400_000 ? { trial_end: Math.floor(Date.parse(brand.trial_ends_at) / 1000) } : {};
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: brand.id,
    ...(brand.stripe_customer_id ? { customer: brand.stripe_customer_id } : { customer_email: email }),
    metadata: { brand_id: brand.id, tier },
    subscription_data: { metadata: { brand_id: brand.id }, ...trial },
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/app/start?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}${from === "setup" ? "/app/plan" : "/app/settings#billing"}`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** The brand fields a subscription sets; shared by the webhook and the return from Checkout. */
export function subscriptionFields(sub: Stripe.Subscription, fallbackTier: Tier | null) {
  const tier = tierForPrice(sub.items.data[0]?.price.id) ?? fallbackTier ?? "growth";
  const fields: Record<string, string | null> = {
    plan: tier,
    plan_status: mapStatus(sub.status),
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
  };
  // No trial: the trial is over as of the subscription's start, so no leftover trial date shows.
  fields.trial_ends_at = new Date((sub.trial_end ?? sub.start_date) * 1000).toISOString();
  return fields;
}

export function mapStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: `${env.siteUrl}/app/settings` });
  return session.url;
}
