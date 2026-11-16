import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { accessFor, activeSessionsFor, createAccessCheckout, isSubscriptionActive, subscriptionPortal, type Access } from "@/lib/billing/stripe";

/**
 * Access is a paid Stripe Checkout session, and no account: a pass until its end date, or an earlier subscription while
 * it's live. The session id sits in an http-only cookie, and the access link the buyer saves carries it to another device.
 */
export const ACCESS_COOKIE = "essayodds_access";
/** The cookie name before the rename, still read so earlier buyers stay signed in. */
export const LEGACY_ACCESS_COOKIE = "admitted_access";
export const accessLink = (sessionId: string, base: string) => `${base}/essay/access?session_id=${encodeURIComponent(sessionId)}`;

export { accessFor, activeSessionsFor, createAccessCheckout, isSubscriptionActive, subscriptionPortal, type Access };

/** The subscribed session on this request, if there is one. */
export async function paidSession(): Promise<string | null> {
  return (await paidAccess())?.id ?? null;
}

/** The paid session on this request and what it unlocks, if there is one. */
export async function paidAccess(): Promise<({ id: string } & Access) | null> {
  const jar = await cookies();
  const id = jar.get(ACCESS_COOKIE)?.value ?? jar.get(LEGACY_ACCESS_COOKIE)?.value;
  if (!id) return null;
  const access = await accessFor(id).catch(() => null);
  return access ? { id, ...access } : null;
}

/** Per subscriber, per day. Generous for real work on a handful of essays. */
export const DAILY_LIMITS = { review: 40, rewrite: 15 } as const;

/** A stable, non-reversible id for a subscriber, for counting their use. */
export const subscriberId = (sessionId: string) => createHash("sha256").update(sessionId).digest("hex").slice(0, 24);

/** A stable, non-reversible id for the caller's network, for capping use without an account. Never stored in the clear. */
export function networkId(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`essayodds-free:${ip}`).digest("hex").slice(0, 24);
}
