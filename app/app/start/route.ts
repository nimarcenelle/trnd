import { redirect } from "next/navigation";

import { tierOf } from "@/lib/billing";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/data";
import { adminSupabase } from "@/lib/db/supabase";
import { isStripeConfigured } from "@/lib/env";
import { isScanning } from "@/lib/format";
import { startScan } from "@/lib/scan";

/**
 * Back from Stripe Checkout. Reads the subscription straight from Stripe
 * rather than waiting on the webhook, turns the plan on, and starts the first
 * scan for a brand that hasn't had one.
 */
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!isStripeConfigured || !sessionId) redirect("/app");

  const { getStripe, subscriptionFields } = await import("@/lib/billing/stripe");
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const sub = session.subscription;
  if (session.metadata?.brand_id !== brand.id || session.status !== "complete" || !sub || typeof sub === "string") redirect("/app/settings#billing");

  await adminSupabase()
    .from("brands")
    .update(subscriptionFields(sub, session.metadata?.tier ? tierOf(session.metadata.tier) : null))
    .eq("id", brand.id);
  if (brand.last_scan_at) redirect("/app/settings?billing=success#billing");
  if (!isScanning(brand)) await startScan(brand.id);
  redirect("/app");
}
