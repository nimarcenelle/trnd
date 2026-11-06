import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

import type { Benchmark } from "./benchmark";
import type { CreatorCheck, CreatorPlatform } from "./check";
import type { FunnelEvent, FunnelEventKind } from "./funnel";
import type { CreatorRead } from "./read";
import type { CreatorStats } from "./stats";
import type { TeardownScript } from "./teardown";

/** The funnel's storage. Without Supabase's service key every write is a logged no-op, so the free check still works. */
const hasDb = () => Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

/** Never throws: a failed log must not fail the visitor's check. */
export async function logEvent(kind: FunnelEventKind, e: { handle?: string; platform?: string; src?: string; meta?: Record<string, unknown> } = {}): Promise<void> {
  if (!hasDb()) return;
  const { error } = await adminSupabase()
    .from("creator_events")
    .insert({ kind, handle: e.handle ?? null, platform: e.platform ?? null, src: e.src || null, meta: e.meta ?? null });
  if (error) console.warn("[creator] event not logged:", error.message);
}

export async function listEvents(sinceDays: number): Promise<FunnelEvent[]> {
  if (!hasDb()) return [];
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await adminSupabase()
    .from("creator_events")
    .select("kind, handle, src, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20_000);
  if (error) throw new Error(error.message);
  return (data ?? []) as FunnelEvent[];
}

export interface Lead {
  id: string;
  email: string;
  handle: string;
  platform: CreatorPlatform;
  niche: string | null;
  token: string;
}

/** Asking again for the same handle restarts the weekly clock and undoes an unsubscribe. */
/** `wantsPlan` only ever turns on: asking for the weekly re-check later does not take someone off the plan's list. */
export async function saveLead(l: { email: string; handle: string; platform: CreatorPlatform; niche?: string; src?: string; wantsPlan?: boolean }): Promise<void> {
  const { error } = await adminSupabase()
    .from("creator_leads")
    .upsert(
      { email: l.email, handle: l.handle, platform: l.platform, niche: l.niche || null, src: l.src || null, next_check_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), unsubscribed_at: null, ...(l.wantsPlan ? { wants_plan: true } : {}) },
      { onConflict: "email,platform,handle" },
    );
  if (error) throw new Error(error.message);
}

export async function dueLeads(limit: number): Promise<Lead[]> {
  const { data, error } = await adminSupabase()
    .from("creator_leads")
    .select("id, email, handle, platform, niche, token")
    .is("unsubscribed_at", null)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export async function markSent(id: string, sent: boolean): Promise<void> {
  // A failed read is tried again tomorrow, not in a week.
  const next = new Date(Date.now() + (sent ? 7 : 1) * 86_400_000).toISOString();
  await adminSupabase().from("creator_leads").update({ next_check_at: next, ...(sent ? { last_sent_at: new Date().toISOString() } : {}) }).eq("id", id);
}

export async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data } = await adminSupabase().from("creator_leads").update({ unsubscribed_at: new Date().toISOString() }).eq("token", token).select("id");
  return Boolean(data?.length);
}

export interface Teardown {
  id: string;
  handle: string;
  platform: CreatorPlatform;
  niche: string | null;
  src: string;
  stats: CreatorStats;
  script: TeardownScript;
  posted_at: string | null;
  created_at: string;
}

export async function saveTeardown(t: Omit<Teardown, "id" | "posted_at" | "created_at">): Promise<string> {
  const { data, error } = await adminSupabase().from("creator_teardowns").insert(t).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function listTeardowns(limit = 30): Promise<Teardown[]> {
  if (!hasDb()) return [];
  const { data, error } = await adminSupabase().from("creator_teardowns").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Teardown[];
}

export async function getTeardown(id: string): Promise<Teardown | null> {
  const { data } = await adminSupabase().from("creator_teardowns").select("*").eq("id", id).maybeSingle();
  return (data as Teardown | null) ?? null;
}

export async function setPosted(id: string, posted: boolean): Promise<void> {
  await adminSupabase().from("creator_teardowns").update({ posted_at: posted ? new Date().toISOString() : null }).eq("id", id);
}

/* ------------------------------ shared results ----------------------------- */

const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ID_CHARS[b % ID_CHARS.length]).join("");

/** Keeps a completed check. Returns its id and the private report token, or null without a database. */
export async function saveCheck(c: CreatorCheck & { email?: string | null; goal?: string | null }): Promise<{ id: string; token: string } | null> {
  if (!hasDb() || !c.stats || !c.handle || !c.platform) return null;
  const id = newId();
  const { data, error } = await adminSupabase()
    .from("creator_checks")
    .insert({
      id,
      handle: c.handle,
      platform: c.platform,
      display_name: c.displayName ?? null,
      followers: c.followers ?? null,
      niche: c.niche || null,
      headline: c.headline ?? "",
      stats: c.stats,
      read: c.read ?? null,
      benchmark: c.benchmark ?? null,
      src: c.src || null,
      email: c.email ?? null,
      goal: c.goal ?? null,
    })
    .select("access_token")
    .single();
  if (error) {
    console.warn("[creator] check not saved:", error.message);
    return null;
  }
  return { id, token: (data as { access_token: string }).access_token };
}

export interface SavedCheck extends CreatorCheck {
  id: string;
  created_at: string;
  token: string;
  email: string | null;
  goal: string | null;
  paid: boolean;
}

export async function getCheck(id: string): Promise<SavedCheck | null> {
  if (!hasDb() || !/^[a-z0-9]{6,16}$/.test(id)) return null;
  const { data } = await adminSupabase().from("creator_checks").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string; handle: string; platform: CreatorPlatform; display_name: string | null; followers: number | null; niche: string | null; headline: string;
    stats: CreatorStats; read: CreatorRead | null; benchmark: Benchmark | null; created_at: string; access_token: string; email: string | null; goal: string | null; paid_at: string | null;
  };
  return {
    id: r.id, handle: r.handle, platform: r.platform, displayName: r.display_name, followers: r.followers, niche: r.niche ?? "", headline: r.headline,
    stats: r.stats, read: r.read, benchmark: r.benchmark, created_at: r.created_at, token: r.access_token, email: r.email, goal: r.goal, paid: Boolean(r.paid_at),
  };
}

/** Marks a check paid. True only for the call that changed it, so the payment is counted once. */
export async function markCheckPaid(id: string, sessionId: string): Promise<boolean> {
  const { data } = await adminSupabase().from("creator_checks").update({ paid_at: new Date().toISOString(), stripe_session_id: sessionId }).eq("id", id).is("paid_at", null).select("id");
  return Boolean(data?.length);
}

export async function upsertCustomer(c: { customerId: string; email: string | null; subscriptionId: string | null; status?: string }): Promise<void> {
  await adminSupabase()
    .from("creator_customers")
    .upsert({ stripe_customer_id: c.customerId, email: c.email, subscription_id: c.subscriptionId, status: c.status ?? "active", updated_at: new Date().toISOString() });
}

export async function setCustomerStatus(subscriptionId: string, status: string): Promise<void> {
  await adminSupabase().from("creator_customers").update({ status, updated_at: new Date().toISOString() }).eq("subscription_id", subscriptionId);
}

/** A customer whose plan is live. A one-time buyer (no subscription) unlocks only the report they paid for. */
export async function customerActive(customerId: string): Promise<boolean> {
  if (!hasDb()) return false;
  const { data } = await adminSupabase().from("creator_customers").select("status, subscription_id").eq("stripe_customer_id", customerId).maybeSingle();
  const r = data as { status: string; subscription_id: string | null } | null;
  return Boolean(r && r.subscription_id && r.status === "active");
}
