import "server-only";

import Stripe from "stripe";

import { accessUntil, parsePlan, type Plan } from "@/lib/essayodds/plans";
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

/** EssayOdds's plans live in lib/essayodds/plans.ts. The product tag is kept from the weekly launch so earlier buyers keep access. */
const ESSAYS_PRODUCT = "essayodds";
/** Product tags from before the rename. Purchases carrying one still unlock. */
const isEssaysProduct = (tag: string | undefined) => tag === ESSAYS_PRODUCT || tag === "admitted-weekly";

const essaysStripe = () => {
  if (!env.stripeSecretKey) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY.");
  client ??= new Stripe(env.stripeSecretKey);
  return client;
};

/** A one-time pass. A parent paying lands on a page with the link to send their student, instead of in the workspace. */
export async function createAccessCheckout(plan: Plan, forSomeoneElse = false): Promise<string> {
  const until = accessUntil(plan.id, new Date()).toISOString();
  const session = await essaysStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.cents, product_data: { name: `EssayOdds ${plan.name}`, description: plan.billed } } }],
    metadata: { product: ESSAYS_PRODUCT, plan: plan.id, access_until: until },
    payment_intent_data: { metadata: { product: ESSAYS_PRODUCT, plan: plan.id } },
    customer_creation: "always",
    allow_promotion_codes: true,
    success_url: forSomeoneElse ? `${env.siteUrl}/pay/done?session_id={CHECKOUT_SESSION_ID}` : `${env.siteUrl}/essay/access?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: forSomeoneElse ? `${env.siteUrl}/pay` : `${env.siteUrl}/pricing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export type Access = { until: Date | null; recurring: boolean; email: string | null };

/**
 * What a checkout session unlocks right now. A pass works until the date fixed at checkout (counted from payment for
 * a Week Pass); a subscription from the earlier pricing works while it's live. The account also sells TRND, so the
 * product is checked too.
 */
export async function accessFor(sessionId: string): Promise<Access | null> {
  if (!sessionId.startsWith("cs_")) return null;
  const session = await essaysStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (!isEssaysProduct(session.metadata?.product)) return null;
  if (session.mode === "payment") {
    if (session.payment_status !== "paid") return null;
    const plan = parsePlan(session.metadata?.plan);
    const fixed = session.metadata?.access_until ? new Date(session.metadata.access_until) : null;
    const until = plan === "week" ? accessUntil("week", new Date(session.created * 1000)) : (fixed ?? accessUntil("rd", new Date(session.created * 1000)));
    return Date.now() < until.getTime() ? { until, recurring: false, email: session.customer_details?.email ?? null } : null;
  }
  const sub = session.subscription;
  return typeof sub === "object" && sub !== null && ["active", "trialing", "past_due"].includes(sub.status) ? { until: null, recurring: true, email: session.customer_details?.email ?? null } : null;
}

/** Every checkout session paid with this email that still unlocks something, newest first. */
export async function activeSessionsFor(email: string): Promise<({ id: string } & Access)[]> {
  const list = await essaysStripe().checkout.sessions.list({ customer_details: { email }, limit: 20 });
  const found: ({ id: string } & Access)[] = [];
  for (const s of list.data) {
    if (!isEssaysProduct(s.metadata?.product)) continue;
    const access = await accessFor(s.id).catch(() => null);
    if (access) found.push({ id: s.id, ...access });
  }
  return found;
}

export const isSubscriptionActive = async (sessionId: string) => (await accessFor(sessionId)) !== null;

/** Stripe's own page for cancelling or changing a card. */
export async function subscriptionPortal(sessionId: string): Promise<string> {
  const session = await essaysStripe().checkout.sessions.retrieve(sessionId);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customer || !isEssaysProduct(session.metadata?.product)) throw new Error("No subscription on this session.");
  const portal = await essaysStripe().billingPortal.sessions.create({ customer, return_url: `${env.siteUrl}/essay` });
  return portal.url;
}
