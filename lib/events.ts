import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

/**
 * The funnel's event log (supabase/migrations/0005_pricing.sql), read by
 * /app/admin. A failed write never fails what the user was doing.
 */
export type EventKind =
  | "preview_started"
  | "account_created"
  | "plan_viewed"
  | "checkout_started"
  | "paid"
  | "canceled"
  | "scorecard_opened"
  | "share_card"
  | "referral_signup"
  | "waitlist"
  | "addon_paid";

export async function logEvent(kind: EventKind, e: { creatorId?: string | null; meta?: Record<string, unknown> } = {}): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return;
  try {
    const { error } = await adminSupabase().from("events").insert({ kind, creator_id: e.creatorId ?? null, meta: e.meta ?? null });
    if (error) console.warn(`[events] ${kind} not logged:`, error.message);
  } catch (err) {
    console.warn(`[events] ${kind} not logged:`, (err as Error).message);
  }
}
