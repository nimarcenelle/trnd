import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { createSubscriptionCheckout, isSubscriptionActive, subscriptionPortal } from "@/lib/billing/stripe";

/**
 * A subscription is a Stripe Checkout session with a live subscription behind it, and no account. The session id sits in an
 * http-only cookie, and the access link the buyer saves carries it to another device.
 */
export const ACCESS_COOKIE = "admitted_access";
export const accessLink = (sessionId: string, base: string) => `${base}/essay/access?session_id=${encodeURIComponent(sessionId)}`;

export { createSubscriptionCheckout, isSubscriptionActive, subscriptionPortal };

/** The subscribed session on this request, if there is one. */
export async function paidSession(): Promise<string | null> {
  const id = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!id) return null;
  return (await isSubscriptionActive(id).catch(() => false)) ? id : null;
}

/** Per subscriber, per day. Generous for real work on a handful of essays. */
export const DAILY_LIMITS = { review: 40, rewrite: 15 } as const;

/** A stable, non-reversible id for a subscriber, for counting their use. */
export const subscriberId = (sessionId: string) => createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
