import { createHash, timingSafeEqual } from "node:crypto";

/** Whether an Authorization header is `Bearer <secret>`, compared in constant time. False when no secret is set. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!secret || !header) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
