import type Stripe from "stripe";

import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { type Addon, ADDONS, paidPlanOf } from "@/lib/billing";
import { sendAddonEmails, sendTrialEndingEmail } from "@/lib/email";
import { logEvent } from "@/lib/events";
import { env, isStripeConfigured } from "@/lib/env";

/** Stripe → creators. The only writer of paid plan state; signature-verified. */

function mapStatus(s: Stripe.Subscription.Status): "active" | "trialing" | "past_due" | "canceled" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  // past_due: Stripe is still retrying, the plan runs on. unpaid: it gave up, so the plan stops like a cancellation.
  if (s === "past_due") return "past_due";
  return "canceled";
}

/**
 * The plan a subscription is on, from its price: "creator_month" or
 * "creator_year" for the current prices, "weekly" or "monthly" for a
 * subscription on the old ones. Else what checkout recorded.
 */
function planOf(sub: Stripe.Subscription | null, fallback?: string | null): string {
  const price = sub?.items?.data?.[0]?.price;
  if (price?.id && price.id === env.stripePriceCreatorYearly) return "creator_year";
  if (price?.id && price.id === env.stripePriceCreatorMonthly) return "creator_month";
  if (price?.id && price.id === env.stripePriceWeekly) return "weekly";
  if (price?.id && price.id === env.stripePriceMonthly) return "monthly";
  if (fallback && paidPlanOf(fallback)) return fallback;
  const unit = price?.recurring?.interval;
  return unit === "year" ? "creator_year" : unit === "week" ? "weekly" : "creator_month";
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
    if (event.type === "checkout.session.completed" && event.data.object.metadata?.addon) {
      // A one-time add-on: record it (once per session), tell the team to make it, tell the buyer when.
      const s = event.data.object;
      const addon = s.metadata!.addon as Addon;
      const creatorId = s.metadata?.creator_id ?? s.client_reference_id;
      if (ADDONS[addon] && s.payment_status === "paid") {
        const email = s.customer_details?.email ?? s.customer_email ?? null;
        const { data: inserted } = await sb
          .from("addon_orders")
          .upsert({ creator_id: creatorId, addon, stripe_session_id: s.id, amount_cents: s.amount_total, email }, { onConflict: "stripe_session_id", ignoreDuplicates: true })
          .select("id");
        if (inserted?.length) {
          const { data: c } = creatorId ? await sb.from("creators").select("handle").eq("id", creatorId).maybeSingle<{ handle: string }>() : { data: null };
          await sendAddonEmails(addon, email, c?.handle ?? null);
          await logEvent("addon_paid", { creatorId, meta: { addon, amount: s.amount_total } });
        }
      }
    } else if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const creatorId = s.metadata?.creator_id ?? s.client_reference_id;
      // A delayed payment method (a bank debit) completes checkout unpaid; the subscription event activates it later.
      if (creatorId && s.payment_status !== "unpaid") {
        // The subscription event that follows carries the real status (trialing or active) and the trial end.
        const sub = idOf(s.subscription) ? await getStripe().subscriptions.retrieve(idOf(s.subscription)!).catch(() => null) : null;
        await sb
          .from("creators")
          .update({
            plan: planOf(sub, s.metadata?.plan ?? s.metadata?.interval),
            plan_status: sub ? mapStatus(sub.status) : "active",
            ...(sub?.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString(), trial_used_at: new Date().toISOString() } : {}),
            stripe_customer_id: idOf(s.customer),
            stripe_subscription_id: idOf(s.subscription),
          })
          .eq("id", creatorId);
        // Stripe redelivers events: one "paid" per checkout session.
        const { data: seen } = await sb.from("events").select("id").eq("kind", "paid").eq("meta->>session", s.id).limit(1);
        if (!seen?.length) await logEvent("paid", { creatorId, meta: { session: s.id, plan: planOf(sub, s.metadata?.plan), status: sub ? mapStatus(sub.status) : "active" } });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      // Events can arrive out of order or twice: the subscription as Stripe has it now decides, not the event's copy of it.
      const sub = (await getStripe().subscriptions.retrieve(event.data.object.id).catch(() => null)) ?? event.data.object;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
      const creatorId = sub.metadata?.creator_id;
      const { data: current } = creatorId
        ? await sb.from("creators").select("stripe_subscription_id").eq("id", creatorId).maybeSingle()
        : await sb.from("creators").select("stripe_subscription_id").eq("stripe_subscription_id", sub.id).maybeSingle();
      // A late event about an older subscription (canceled, then re-subscribed) never overwrites the current one.
      const stale = current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && status !== "active" && status !== "trialing";
      if (!stale) {
        const q = sb.from("creators").update({
          plan: planOf(sub, sub.metadata?.plan ?? sub.metadata?.interval),
          plan_status: status,
          ...(sub.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() } : {}),
          stripe_customer_id: idOf(sub.customer),
          stripe_subscription_id: sub.id,
        });
        await (creatorId ? q.eq("id", creatorId) : q.eq("stripe_subscription_id", sub.id));
        if (event.type === "customer.subscription.deleted") {
          // Churn by tier and billing period, with how long they stayed.
          const days = sub.start_date ? Math.round((Date.now() / 1000 - sub.start_date) / 86_400) : null;
          await logEvent("canceled", { creatorId: creatorId ?? null, meta: { subscription: sub.id, plan: planOf(sub, sub.metadata?.plan ?? sub.metadata?.interval), days } });
        }
      }
    }
    if (event.type === "customer.subscription.trial_will_end") {
      // Three days before the first charge: say when, how much, and how to cancel.
      const sub = event.data.object;
      const { data: c } = await sb.from("creators").select("*").eq("stripe_subscription_id", sub.id).maybeSingle<Creator>();
      const end = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      // Stripe redelivers events: one reminder per trial end.
      if (c && end && (!c.trial_reminder_for || new Date(c.trial_reminder_for).getTime() !== end.getTime())) {
        await sendTrialEndingEmail(sb, c, end, planOf(sub, sub.metadata?.plan ?? sub.metadata?.interval));
        await sb.from("creators").update({ trial_reminder_for: end.toISOString() }).eq("id", c.id);
      }
    }
  } catch (err) {
    console.warn(`[stripe] ${event.type} failed:`, (err as Error).message);
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
}
