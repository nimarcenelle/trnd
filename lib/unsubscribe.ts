import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signed link in every update email that turns those emails off, with
 * no sign-in: the token is an HMAC of the brand id, so it can't be forged
 * for someone else's brand.
 */

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function unsubscribeToken(brandId: string, key = secret()): string {
  return createHmac("sha256", `unsubscribe:${key}`).update(brandId).digest("base64url").slice(0, 32);
}

export function checkUnsubscribeToken(brandId: string, token: string, key = secret()): boolean {
  if (!key || !brandId || !token) return false;
  const a = Buffer.from(unsubscribeToken(brandId, key));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(siteUrl: string, brandId: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/unsubscribe?b=${encodeURIComponent(brandId)}&t=${unsubscribeToken(brandId)}`;
}
