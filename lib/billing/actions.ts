"use server";

import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { PAID_PLANS } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";

import { getOrCreateSubscription } from "./index";

/**
 * Start a checkout for the chosen plan. Redirects to Stripe's hosted page;
 * with billing unconfigured it bounces back to Settings with an explanatory
 * flag instead of erroring.
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const asked = String(formData.get("plan") ?? "baseline");
  const plan = (PAID_PLANS as readonly string[]).includes(asked) ? (asked as (typeof PAID_PLANS)[number]) : "baseline";
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isStripeConfigured) redirect("/app/settings?billing=unconfigured");

  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const sub = await getOrCreateSubscription(repo, business);
  const { createCheckoutSession } = await import("./stripe");
  let url: string;
  try {
    url = await createCheckoutSession({
      business,
      email: user.email,
      plan,
      existingCustomerId: sub.stripe_customer_id,
    });
  } catch (err) {
    console.warn("[billing] checkout failed:", (err as Error).message);
    redirect("/app/settings?billing=error");
  }
  redirect(url);
}

/** Open Stripe's hosted billing portal for an existing customer. */
export async function openBillingPortalAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isStripeConfigured) redirect("/app/settings?billing=unconfigured");

  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const sub = await getOrCreateSubscription(repo, business);
  if (!sub.stripe_customer_id) redirect("/app/settings?billing=nocustomer");

  const { createPortalSession } = await import("./stripe");
  let url: string;
  try {
    url = await createPortalSession(sub.stripe_customer_id);
  } catch (err) {
    console.warn("[billing] portal failed:", (err as Error).message);
    redirect("/app/settings?billing=error");
  }
  redirect(url);
}
