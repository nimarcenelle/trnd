import "server-only";

import Stripe from "stripe";

import type { Brand } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/** The only file that imports the Stripe SDK. */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY and STRIPE_PRICE.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export async function createCheckoutSession(brand: Brand, email: string): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.stripePrice, quantity: 1 }],
    client_reference_id: brand.id,
    ...(brand.stripe_customer_id ? { customer: brand.stripe_customer_id } : { customer_email: email }),
    metadata: { brand_id: brand.id },
    subscription_data: { metadata: { brand_id: brand.id } },
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

/** Admitted: one payment for the cycle, in dollars here and on the page. */
export const CYCLE_PRICE_CENTS = 29900;
const CYCLE_PRODUCT = "admitted-cycle";

const cycleStripe = () => {
  if (!env.stripeSecretKey) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
};

export async function createCyclePurchase(): Promise<string> {
  const session = await cycleStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: CYCLE_PRICE_CENTS, product_data: { name: "Admitted: essay review and rewrites for the cycle" } } }],
    metadata: { product: CYCLE_PRODUCT },
    success_url: `${env.siteUrl}/essay/access?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/essay`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** The Stripe account also sells TRND, so the product is checked as well as the payment. */
export async function isCyclePurchasePaid(sessionId: string): Promise<boolean> {
  if (!sessionId.startsWith("cs_")) return false;
  const session = await cycleStripe().checkout.sessions.retrieve(sessionId);
  return session.payment_status === "paid" && session.metadata?.product === CYCLE_PRODUCT;
}
