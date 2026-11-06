import "server-only";

import Stripe from "stripe";

import type { Brand } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/** The only file that imports the Stripe SDK. */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY and STRIPE_PRICE.");
  return stripeClient();
}

/** The client alone, for the creator plan, which needs STRIPE_CREATOR_PRICE rather than STRIPE_PRICE. */
export function stripeClient(): Stripe {
  if (!env.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

/** Checkout for one creator report. A recurring price makes it the creator plan; a one-time price unlocks just this report. */
export async function createCreatorCheckout(check: { id: string; token: string; email: string | null; handle: string }): Promise<string> {
  const stripe = stripeClient();
  const price = await stripe.prices.retrieve(env.stripeCreatorPrice);
  const subscription = Boolean(price.recurring);
  const back = `${env.siteUrl}/r/${check.id}?k=${check.token}`;
  const metadata = { kind: "creator", check_id: check.id };
  const session = await stripe.checkout.sessions.create({
    mode: subscription ? "subscription" : "payment",
    line_items: [{ price: env.stripeCreatorPrice, quantity: 1 }],
    client_reference_id: check.id,
    ...(check.email ? { customer_email: check.email } : {}),
    ...(subscription ? { subscription_data: { metadata } } : { customer_creation: "always" as const }),
    metadata,
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/r/${check.id}/paid?k=${check.token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Whether a returning Checkout session paid for this check, and who paid. */
export async function paidSession(sessionId: string, checkId: string): Promise<{ customerId: string | null; email: string | null; subscriptionId: string | null } | null> {
  const s = await stripeClient().checkout.sessions.retrieve(sessionId);
  if (s.metadata?.kind !== "creator" || s.metadata.check_id !== checkId) return null;
  if (s.status !== "complete" || (s.payment_status !== "paid" && s.payment_status !== "no_payment_required")) return null;
  const id = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));
  return { customerId: id(s.customer), email: s.customer_details?.email ?? s.customer_email ?? null, subscriptionId: id(s.subscription) };
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
