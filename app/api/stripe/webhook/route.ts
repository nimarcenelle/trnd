import type Stripe from "stripe";

import { adminSupabase } from "@/lib/db/supabase";
import { env, isStripeConfigured } from "@/lib/env";

/** Stripe → creators. The only writer of paid plan state; signature-verified. */

function mapStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
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
      if (creatorId) {
        await sb
          .from("creators")
          .update({ plan: "pro", plan_status: "active", stripe_customer_id: idOf(s.customer), stripe_subscription_id: idOf(s.subscription) })
          .eq("id", creatorId);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
      const q = sb.from("creators").update({ plan: "pro", plan_status: status, stripe_customer_id: idOf(sub.customer), stripe_subscription_id: sub.id });
      await (sub.metadata?.creator_id ? q.eq("id", sub.metadata.creator_id) : q.eq("stripe_subscription_id", sub.id));
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
