import { accessFor, endWeeklyFor } from "@/lib/essayodds/access";
import { emailAccessOnce } from "@/lib/essayodds/access-email";
import { checkoutEvent, paidCheckoutIn } from "@/lib/billing/stripe";
import { env } from "@/lib/env";

export const maxDuration = 60;

/**
 * Stripe tells us a checkout was paid, whether or not the buyer's browser made it back. The access link is emailed here
 * (once per purchase, shared with the return pages), so closing the tab after paying never means paying for nothing.
 * The Stripe account sells other products too; only EssayOdds checkouts are acted on.
 */
export async function POST(request: Request): Promise<Response> {
  if (!env.stripeWebhookSecret) return Response.json({ error: "not_configured" }, { status: 503 });
  const body = await request.text();
  let id: string | null;
  try {
    id = paidCheckoutIn(checkoutEvent(body, request.headers.get("stripe-signature") ?? ""));
  } catch (err) {
    console.error("[stripe-webhook] signature", (err as Error).message);
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }
  if (!id) return Response.json({ received: true });
  try {
    const access = await accessFor(id);
    if (access) {
      await emailAccessOnce({ id, ...access });
      await endWeeklyFor(access);
    }
    return Response.json({ received: true });
  } catch (err) {
    // A 500 has Stripe send the event again, which is what a failed email needs.
    console.error("[stripe-webhook]", (err as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
