import "server-only";

import Stripe from "stripe";

import type { Plan } from "@/lib/admitted/plans";
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

/** Admitted's plans live in lib/admitted/plans.ts. The product tag is kept from the weekly launch so those subscribers keep access. */
const ESSAYS_PRODUCT = "admitted-weekly";

const essaysStripe = () => {
  if (!env.stripeSecretKey) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
};

/** A parent paying lands on a page with the link to send their student, instead of in the workspace. */
export async function createSubscriptionCheckout(plan: Plan, forSomeoneElse = false): Promise<string> {
  const session = await essaysStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.cents, recurring: { interval: "month", interval_count: plan.months }, product_data: { name: `Admitted essays, ${plan.name.toLowerCase()}` } } }],
    metadata: { product: ESSAYS_PRODUCT, plan: plan.id },
    subscription_data: { metadata: { product: ESSAYS_PRODUCT, plan: plan.id } },
    allow_promotion_codes: true,
    success_url: forSomeoneElse ? `${env.siteUrl}/pay/done?session_id={CHECKOUT_SESSION_ID}` : `${env.siteUrl}/essay/access?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: forSomeoneElse ? `${env.siteUrl}/pay` : `${env.siteUrl}/essay`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Access lasts while the subscription is live. The account also sells TRND, so the product is checked too. */
export async function isSubscriptionActive(sessionId: string): Promise<boolean> {
  if (!sessionId.startsWith("cs_")) return false;
  const session = await essaysStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.metadata?.product !== ESSAYS_PRODUCT) return false;
  const sub = session.subscription;
  return typeof sub === "object" && sub !== null && ["active", "trialing", "past_due"].includes(sub.status);
}

/** Stripe's own page for cancelling or changing a card. */
export async function subscriptionPortal(sessionId: string): Promise<string> {
  const session = await essaysStripe().checkout.sessions.retrieve(sessionId);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customer || session.metadata?.product !== ESSAYS_PRODUCT) throw new Error("No subscription on this session.");
  const portal = await essaysStripe().billingPortal.sessions.create({ customer, return_url: `${env.siteUrl}/essay` });
  return portal.url;
}
