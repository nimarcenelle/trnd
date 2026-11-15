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

/**
 * The free review: one per browser, no card. The cookie holds the key of the review it was spent on, so the same draft
 * opens again for free and a new one asks for a plan. Clearing cookies gets another, so each network is also capped a day.
 */
export const FREE_COOKIE = "admitted_free";
export const FREE_PER_NETWORK_PER_DAY = 3;

/** A stable, non-reversible id for the caller's network, for counting free use. Never stored in the clear. */
export function networkId(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`admitted-free:${ip}`).digest("hex").slice(0, 24);
}
