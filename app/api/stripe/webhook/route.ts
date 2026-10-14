import type Stripe from "stripe";

import { tierOf } from "@/lib/billing";
import { adminSupabase } from "@/lib/db/supabase";
import { env, isStripeConfigured } from "@/lib/env";

/** Stripe → brands. The writer of paid plan state (with /app/start, which reads the same subscription); signature-verified. */

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured || !env.stripeWebhookSecret) return new Response("billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const { getStripe, subscriptionFields } = await import("@/lib/billing/stripe");
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
      const brandId = s.metadata?.brand_id ?? s.client_reference_id;
      const subId = idOf(s.subscription);
      if (brandId && subId) {
        const sub = await getStripe().subscriptions.retrieve(subId);
        await sb.from("brands").update(subscriptionFields(sub, s.metadata?.tier ? tierOf(s.metadata.tier) : null)).eq("id", brandId);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const fields = subscriptionFields(sub, null);
      if (event.type === "customer.subscription.deleted") fields.plan_status = "canceled";
      const q = sb.from("brands").update(fields);
      await (sub.metadata?.brand_id ? q.eq("id", sub.metadata.brand_id) : q.eq("stripe_subscription_id", sub.id));
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
