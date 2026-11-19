import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { currentSession } from "./auth";
import { DEMO_COOKIE } from "./demo";
import { RD_PASS_ENDS } from "./plans";
import { putLatest, readSaved } from "./saved";
import { accessFor, activeSessionsFor, cancelWeeklyBehind, createAccessCheckout, isSubscriptionActive, subscriptionPortal, type Access } from "@/lib/billing/stripe";

/**
 * Access is a paid Stripe Checkout session: the RD Pass until its end date, or the weekly subscription while it's live. It is
 * found through the signed-in account, or through an http-only cookie the access link sets on any device.
 */
export const ACCESS_COOKIE = "essayodds_access";
/** The cookie name before the rename, still read so earlier buyers stay signed in. */
export const LEGACY_ACCESS_COOKIE = "admitted_access";
export const accessLink = (sessionId: string, base: string) => `${base}/essay/access?session_id=${encodeURIComponent(sessionId)}`;

export { accessFor, activeSessionsFor, createAccessCheckout, isSubscriptionActive, subscriptionPortal, type Access };

/**
 * A one-time pass replaces Weekly: every live weekly subscription the buyer holds is cancelled, found by the email they
 * paid with plus any sessions the caller already knows are theirs (this browser's cookie, their account's purchases).
 */
export async function endWeeklyFor(pass: Access, known: string[] = []): Promise<void> {
  if (pass.recurring) return;
  const byEmail = pass.email ? (await activeSessionsFor(pass.email).catch(() => [])).filter((s) => s.recurring).map((s) => s.id) : [];
  const n = await cancelWeeklyBehind([...known, ...byEmail]);
  if (n) console.log(`[access] cancelled ${n} weekly subscription(s) replaced by a pass`);
}

/** The subscribed session on this request, if there is one. */
export async function paidSession(): Promise<string | null> {
  return (await paidAccess())?.id ?? null;
}

/**
 * The paid session on this request and what it unlocks, if there is one: this browser's access cookie first, then any
 * purchase tied to the signed-in account (made while signed in, or paid with the account's email).
 */
export async function paidAccess(): Promise<({ id: string } & Access) | null> {
  const jar = await cookies();
  // Demo mode: unlocked, but the routes only answer the sample student.
  if (jar.get(DEMO_COOKIE)?.value === "1") return { id: "demo", until: RD_PASS_ENDS, recurring: false, email: null, plan: "pro" };
  const id = jar.get(ACCESS_COOKIE)?.value ?? jar.get(LEGACY_ACCESS_COOKIE)?.value;
  const found: ({ id: string } & Access)[] = [];
  if (id) {
    const access = await accessFor(id).catch(() => null);
    if (access) found.push({ id, ...access });
  }
  const session = await currentSession();
  if (session) {
    for (const owned of await purchasesOf(session.uid)) {
      if (owned === id) continue;
      const access = await accessFor(owned).catch(() => null);
      if (access) found.push({ id: owned, ...access });
    }
    if (!found.length) found.push(...(await activeSessionsFor(session.email).catch(() => [])));
  }
  // Pro wins when someone holds more than one pass, so its extras show up wherever they look.
  return found.find((a) => a.plan === "pro") ?? found[0] ?? null;
}

export const isPro = (access: Access | null) => access?.plan === "pro";

const purchasesKey = (uid: string) => `data:${uid}:purchases`;

export async function purchasesOf(uid: string): Promise<string[]> {
  const row = (await readSaved<{ ids: string[] }>([purchasesKey(uid)]).catch(() => new Map<string, { ids: string[] }>())).get(purchasesKey(uid));
  return row?.ids ?? [];
}

/** Ties a paid checkout to an account, so it unlocks wherever the account signs in. */
export async function addPurchase(uid: string, sessionId: string): Promise<void> {
  const ids = await purchasesOf(uid);
  if (!ids.includes(sessionId)) await putLatest("user_data", purchasesKey(uid), { ids: [sessionId, ...ids].slice(0, 20) });
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
