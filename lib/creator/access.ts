import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

import { customerActive } from "./store";

/**
 * Who has paid, without accounts: a cookie carrying the Stripe customer id,
 * signed so it can't be forged. Set once, when Checkout returns; read on
 * every report. It unlocks reports only while that customer's plan is live.
 */

export const PAID_COOKIE = "trnd_creator";
const YEAR = 365 * 86_400;

const sign = (v: string) => createHmac("sha256", env.creatorSecret).update(`creator:${v}`).digest("base64url");

export function paidCookieValue(customerId: string): string {
  return `${customerId}.${sign(customerId)}`;
}

export function verifyPaidCookie(value: string | undefined): string | null {
  if (!value || !env.creatorSecret) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const paidCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: YEAR };

/** True when this browser carries a creator plan that is still active. */
export async function hasActivePlan(): Promise<boolean> {
  const id = verifyPaidCookie((await cookies()).get(PAID_COOKIE)?.value);
  return id ? customerActive(id) : false;
}
