import "server-only";

import Stripe from "stripe";

import type { Creator } from "@/lib/db/types";
import type { Interval } from "@/lib/billing";
import { env, isStripeConfigured } from "@/lib/env";

/** The only file that imports the Stripe SDK. */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY, STRIPE_PRICE_WEEKLY and STRIPE_PRICE_MONTHLY.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export async function createCheckoutSession(creator: Creator, email: string, interval: Interval): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: interval === "weekly" ? env.stripePriceWeekly : env.stripePriceMonthly, quantity: 1 }],
    client_reference_id: creator.id,
    ...(creator.stripe_customer_id ? { customer: creator.stripe_customer_id } : { customer_email: email }),
    metadata: { creator_id: creator.id, interval },
    subscription_data: { metadata: { creator_id: creator.id, interval } },
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/app/settings?billing=success`,
    cancel_url: `${env.siteUrl}/app/settings`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: `${env.siteUrl}/app/settings` });
  return session.url;
}
