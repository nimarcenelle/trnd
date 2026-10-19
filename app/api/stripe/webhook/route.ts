import type Stripe from "stripe";

import { adminSupabase } from "@/lib/db/supabase";
import { env, isStripeConfigured } from "@/lib/env";

/** Stripe → creators. The only writer of paid plan state; signature-verified. */

function mapStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
}

/** The plan a subscription is on: "weekly" or "monthly" from its price, else what checkout recorded. */
function planOf(sub: Stripe.Subscription | null, fallback?: string | null): string {
  const unit = sub?.items?.data?.[0]?.price?.recurring?.interval;
  if (unit === "week") return "weekly";
  if (unit === "month") return "monthly";
  return fallback === "weekly" || fallback === "monthly" ? fallback : "monthly";
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured || !env.stripeWebhookSecret) return new Response("billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const { getStripe } = await import("@/lib/billing/stripe");
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(await req.text(), signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] bad webhook signature:", (err as Error).message);
    return new Response("bad signature", { status: 400 });
  }

  const sb = adminSupabase();
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const creatorId = s.metadata?.creator_id ?? s.client_reference_id;
      // A delayed payment method (a bank debit) completes checkout unpaid; the subscription event activates it later.
      if (creatorId && s.payment_status !== "unpaid") {
        await sb
          .from("creators")
          .update({ plan: planOf(null, s.metadata?.interval), plan_status: "active", stripe_customer_id: idOf(s.customer), stripe_subscription_id: idOf(s.subscription) })
          .eq("id", creatorId);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
      const creatorId = sub.metadata?.creator_id;
      const { data: current } = creatorId
        ? await sb.from("creators").select("stripe_subscription_id").eq("id", creatorId).maybeSingle()
        : await sb.from("creators").select("stripe_subscription_id").eq("stripe_subscription_id", sub.id).maybeSingle();
      // A late event about an older subscription (canceled, then re-subscribed) never overwrites the current one.
      const stale = current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && status !== "active";
      if (!stale) {
        const q = sb.from("creators").update({ plan: planOf(sub, sub.metadata?.interval), plan_status: status, stripe_customer_id: idOf(sub.customer), stripe_subscription_id: sub.id });
        await (creatorId ? q.eq("id", creatorId) : q.eq("stripe_subscription_id", sub.id));
      }
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
