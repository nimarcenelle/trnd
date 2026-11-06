import type Stripe from "stripe";

import { adminSupabase } from "@/lib/db/supabase";
import { logEvent, markCheckPaid, setCustomerStatus, upsertCustomer } from "@/lib/creator/store";
import { env, isCreatorBillingConfigured, isStripeConfigured } from "@/lib/env";

/** Stripe → brands, and → creators (metadata kind "creator"). The only writer of paid plan state; signature-verified. */

function mapStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export async function POST(req: Request): Promise<Response> {
  if (!(isStripeConfigured || isCreatorBillingConfigured) || !env.stripeWebhookSecret) return new Response("billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const { stripeClient } = await import("@/lib/billing/stripe");
  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(await req.text(), signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] bad webhook signature:", (err as Error).message);
    return new Response("bad signature", { status: 400 });
  }

  const sb = adminSupabase();
  try {
    if (event.type === "checkout.session.completed" && event.data.object.metadata?.kind === "creator") {
      // A creator unlocked a report. The return page usually records it first; this catches a closed tab.
      const s = event.data.object;
      const checkId = s.metadata?.check_id;
      const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
      const customerId = idOf(s.customer);
      if (paid && customerId) await upsertCustomer({ customerId, email: s.customer_details?.email ?? s.customer_email ?? null, subscriptionId: idOf(s.subscription) });
      if (paid && checkId && (await markCheckPaid(checkId, s.id))) await logEvent("paid", { meta: { id: checkId, session: s.id, via: "webhook" } });
    } else if ((event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") && event.data.object.metadata?.kind === "creator") {
      const sub = event.data.object;
      await setCustomerStatus(sub.id, event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status));
    } else if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const brandId = s.metadata?.brand_id ?? s.client_reference_id;
      if (brandId) {
        await sb
          .from("brands")
          .update({ plan: "pro", plan_status: "active", stripe_customer_id: idOf(s.customer), stripe_subscription_id: idOf(s.subscription) })
          .eq("id", brandId);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
      const q = sb.from("brands").update({ plan: "pro", plan_status: status, stripe_customer_id: idOf(sub.customer), stripe_subscription_id: sub.id });
      await (sub.metadata?.brand_id ? q.eq("id", sub.metadata.brand_id) : q.eq("stripe_subscription_id", sub.id));
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
