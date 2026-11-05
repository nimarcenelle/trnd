import "server-only";

import { cookies } from "next/headers";

import { createCyclePurchase, isCyclePurchasePaid } from "@/lib/billing/stripe";

/**
 * A purchase is a paid Stripe Checkout session, with no account behind it. The session id sits in an
 * http-only cookie, and the access link the buyer saves carries it to another device.
 */
export const ACCESS_COOKIE = "admitted_access";
export const accessLink = (sessionId: string, base: string) => `${base}/essay/access?session_id=${encodeURIComponent(sessionId)}`;

export { createCyclePurchase, isCyclePurchasePaid };

/** The paid session on this request, if there is one. */
export async function paidSession(): Promise<string | null> {
  const id = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!id) return null;
  return (await isCyclePurchasePaid(id).catch(() => false)) ? id : null;
}
