import type Stripe from "stripe";

import { getAdminRepo } from "@/lib/db";
import { PAID_PLANS, type PlanId, type SubscriptionStatus } from "@/lib/db/types";
import { env, isStripeConfigured } from "@/lib/env";

/**
 * Stripe → TRND. The only writer of paid plan state. Signature-verified;
 * idempotent (upserts keyed on business_id); unknown events are 200-OK'd so
 * Stripe doesn't retry them forever.
 */

const isPaidPlan = (p: unknown): p is Exclude<PlanId, "trial"> => typeof p === "string" && (PAID_PLANS as readonly string[]).includes(p);

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured || !env.stripeWebhookSecret) {
    return new Response("billing not configured", { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const { getStripe, planForPriceId } = await import("@/lib/billing/stripe");
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      env.stripeWebhookSecret,
    );
  } catch (err) {
    console.warn("[stripe] bad webhook signature:", (err as Error).message);
    return new Response("bad signature", { status: 400 });
  }

  const repo = getAdminRepo();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const businessId =
          session.metadata?.business_id ?? session.client_reference_id ?? null;
        if (!businessId) break;
        const plan = isPaidPlan(session.metadata?.plan) ? session.metadata!.plan : "baseline";
        const existing = await repo.getSubscription(businessId);
        await repo.upsertSubscription({
          business_id: businessId,
          plan,
          status: "active",
          stripe_customer_id:
            typeof session.customer === "string"
              ? session.customer
              : (session.customer?.id ?? existing?.stripe_customer_id ?? null),
          stripe_subscription_id:
            typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription?.id ?? existing?.stripe_subscription_id ?? null),
          current_period_end: existing?.current_period_end ?? null,
          trial_ends_at: existing?.trial_ends_at ?? null,
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const businessId = sub.metadata?.business_id ?? null;
        const existing = businessId
          ? await repo.getSubscription(businessId)
          : await repo.getSubscriptionByStripeId(sub.id);
        if (!existing) break;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const periodEnd = sub.items.data[0]?.current_period_end;
        await repo.upsertSubscription({
          business_id: existing.business_id,
          plan:
            event.type === "customer.subscription.deleted"
              ? existing.plan
              : planForPriceId(priceId),
          status:
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : mapStatus(sub.status),
          stripe_customer_id:
            typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripe_subscription_id: sub.id,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          trial_ends_at: existing.trial_ends_at,
        });
        break;
      }
      default:
        break; // not ours — acknowledge so Stripe stops retrying
    }
  } catch (err) {
    console.warn(`[stripe] webhook ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
