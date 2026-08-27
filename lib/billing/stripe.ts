import "server-only";

import Stripe from "stripe";

import type { Business, PlanId } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/**
 * The only file that imports the Stripe SDK. Everything degrades: without
 * STRIPE_SECRET_KEY these helpers are never called (isStripeConfigured
 * gates every call site), so the app runs key-free end to end.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured) {
    throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY and price ids.");
  }
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export function priceIdFor(plan: Exclude<PlanId, "trial">): string | null {
  const id = plan === "pro" ? env.stripePricePro : env.stripePriceBaseline;
  return id || null;
}

export function planForPriceId(priceId: string | null | undefined): Exclude<PlanId, "trial"> {
  if (priceId && priceId === env.stripePricePro) return "pro";
  return "baseline";
}

/** Hosted checkout for a plan. Returns the URL to redirect the owner to. */
export async function createCheckoutSession(opts: {
  business: Business;
  email: string;
  plan: Exclude<PlanId, "trial">;
  existingCustomerId: string | null;
}): Promise<string> {
  const stripe = getStripe();
  const price = priceIdFor(opts.plan);
  if (!price) throw new Error(`No Stripe price configured for the ${opts.plan} plan.`);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: opts.business.id,
    ...(opts.existingCustomerId
      ? { customer: opts.existingCustomerId }
      : { customer_email: opts.email }),
    metadata: { business_id: opts.business.id, plan: opts.plan },
    subscription_data: { metadata: { business_id: opts.business.id } },
    allow_promotion_codes: true,
    success_url: `${env.siteUrl}/app/settings?billing=success`,
    cancel_url: `${env.siteUrl}/app/settings?billing=canceled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Stripe's hosted billing portal — invoices, card changes, cancellation. */
export async function createPortalSession(customerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.siteUrl}/app/settings`,
  });
  return session.url;
}
