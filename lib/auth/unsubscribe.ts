import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * The token in a plan email's unsubscribe link: an HMAC of the creator's id, so the
 * link works without signing in and can't be made up for someone else's account.
 */
export function unsubscribeToken(creatorId: string, secret = env.cronSecret || env.supabaseServiceRoleKey): string {
  return createHmac("sha256", `unsubscribe:${secret}`).update(creatorId).digest("base64url");
}

export function unsubscribeTokenOk(creatorId: string, token: string | null | undefined, secret = env.cronSecret || env.supabaseServiceRoleKey): boolean {
  if (!secret || !creatorId || !token) return false;
  const a = Buffer.from(unsubscribeToken(creatorId, secret));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The page a person lands on from the email: it asks before turning anything off, so a link scanner's visit changes nothing. */
export function unsubscribeUrl(creatorId: string): string {
  return `${env.siteUrl}/unsubscribe?c=${encodeURIComponent(creatorId)}&t=${unsubscribeToken(creatorId)}`;
}

/** Where a mail app's one-click unsubscribe (RFC 8058) posts. */
export function unsubscribePostUrl(creatorId: string): string {
  return `${env.siteUrl}/api/unsubscribe?c=${encodeURIComponent(creatorId)}&t=${unsubscribeToken(creatorId)}`;
}
