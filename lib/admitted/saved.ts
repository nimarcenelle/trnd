import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

import { isSealed, seal, unseal } from "./seal";

/** Results that quote a student's essay. They are never written in the clear. */
const SEALED_KINDS = new Set(["review", "rewrite"]);

/**
 * Every AI result is saved under a key built from its inputs, so unchanged inputs show the
 * first result again. The first write wins, even when two requests race.
 */
export async function readSaved<T>(keys: string[]): Promise<Map<string, T>> {
  if (!keys.length) return new Map();
  const { data, error } = await adminSupabase().from("ai_results").select("key, value").in("key", keys);
  if (error) throw error;
  const found = new Map<string, T>();
  for (const row of data ?? []) {
    if (!isSealed(row.value)) {
      found.set(row.key as string, row.value as T);
      continue;
    }
    // A row sealed under an older key reads as a miss and is made again.
    try {
      found.set(row.key as string, unseal<T>(row.value, env.essayEncryptionKey));
    } catch (err) {
      console.warn("[saved] could not open a sealed result", (err as Error).message);
    }
  }
  return found;
}

export async function saveFirst<T>(kind: string, rows: { key: string; value: T }[]): Promise<Map<string, T>> {
  if (rows.length) {
    const { error } = await adminSupabase()
      .from("ai_results")
      .upsert(rows.map((r) => ({ kind, key: r.key, value: SEALED_KINDS.has(kind) ? seal(r.value, env.essayEncryptionKey) : r.value })), { onConflict: "key", ignoreDuplicates: true });
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
