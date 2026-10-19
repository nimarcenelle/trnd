import type Stripe from "stripe";

import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { sendTrialEndingEmail } from "@/lib/email";
import { env, isStripeConfigured } from "@/lib/env";

/** Stripe → creators. The only writer of paid plan state; signature-verified. */

function mapStatus(s: Stripe.Subscription.Status): "active" | "trialing" | "past_due" | "canceled" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
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
        // The subscription event that follows carries the real status (trialing or active) and the trial end.
        const sub = idOf(s.subscription) ? await (await import("@/lib/billing/stripe")).getStripe().subscriptions.retrieve(idOf(s.subscription)!).catch(() => null) : null;
        await sb
          .from("creators")
          .update({
            plan: planOf(sub, s.metadata?.interval),
            plan_status: sub ? mapStatus(sub.status) : "active",
            ...(sub?.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString(), trial_used_at: new Date().toISOString() } : {}),
            stripe_customer_id: idOf(s.customer),
            stripe_subscription_id: idOf(s.subscription),
          })
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
      const stale = current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && status !== "active" && status !== "trialing";
      if (!stale) {
        const q = sb.from("creators").update({
          plan: planOf(sub, sub.metadata?.interval),
          plan_status: status,
          ...(sub.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() } : {}),
          stripe_customer_id: idOf(sub.customer),
          stripe_subscription_id: sub.id,
        });
        await (creatorId ? q.eq("id", creatorId) : q.eq("stripe_subscription_id", sub.id));
      }
    }
    if (event.type === "customer.subscription.trial_will_end") {
      // Three days before the first charge: say when, how much, and how to cancel.
      const sub = event.data.object;
      const { data: c } = await sb.from("creators").select("*").eq("stripe_subscription_id", sub.id).maybeSingle<Creator>();
      if (c && sub.trial_end) await sendTrialEndingEmail(sb, c, new Date(sub.trial_end * 1000), planOf(sub, sub.metadata?.interval));
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
