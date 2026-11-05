import "server-only";

import { adminSupabase } from "@/lib/db/supabase";

/**
 * Every AI result is saved under a key built from its inputs, so unchanged inputs show the
 * first result again. The first write wins, even when two requests race.
 */
export async function readSaved<T>(keys: string[]): Promise<Map<string, T>> {
  if (!keys.length) return new Map();
  const { data, error } = await adminSupabase().from("ai_results").select("key, value").in("key", keys);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.key as string, r.value as T]));
}

export async function saveFirst<T>(kind: string, rows: { key: string; value: T }[]): Promise<Map<string, T>> {
  if (rows.length) {
    const { error } = await adminSupabase()
      .from("ai_results")
      .upsert(rows.map((r) => ({ kind, key: r.key, value: r.value })), { onConflict: "key", ignoreDuplicates: true });
    if (error) throw error;
  }
  return readSaved<T>(rows.map((r) => r.key));
}

/** How many new results of a kind were made today, for the daily spending cap. */
export async function countToday(kind: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await adminSupabase().from("ai_results").select("key", { count: "exact", head: true }).eq("kind", kind).gte("created_at", start.toISOString());
  if (error) throw error;
  return count ?? 0;
}
