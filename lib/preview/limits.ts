import { createHash } from "node:crypto";

/**
 * Who may start a free preview. Each costs an Apify read and two model calls,
 * so a visitor gets several a day, and all visitors together a daily budget;
 * past it, visitors are sent to sign up instead (a signed-up account is read
 * by the normal scan). The per-visitor cap stops one script, not people: phone
 * carriers put many visitors behind one address, and a creator checks a few
 * friends' accounts too. A read that failed doesn't count (it is re-run).
 */
export const PER_VISITOR_PER_DAY = 10;
export const DAILY_BUDGET = Math.max(10, Number(process.env.PREVIEW_DAILY_CAP) || 300);

/** A visitor key from their IP: hashed, so no address is stored. */
export function visitorKey(ip: string | null): string {
  return `ip:${createHash("sha256").update(`${ip ?? "unknown"}|trnd-preview`).digest("hex").slice(0, 32)}`;
}

/** The first address in x-forwarded-for, which on Vercel is the client. */
export function clientIp(forwardedFor: string | null, realIp: string | null): string | null {
  return forwardedFor?.split(",")[0]?.trim() || realIp || null;
}

export type Gate = { ok: true } | { ok: false; reason: "visitor" | "budget" };

/** Whether one more preview fits, given today's counts for this visitor and in all. */
export function gate(visitorToday: number, allToday: number): Gate {
  if (allToday >= DAILY_BUDGET) return { ok: false, reason: "budget" };
  if (visitorToday >= PER_VISITOR_PER_DAY) return { ok: false, reason: "visitor" };
  return { ok: true };
}
