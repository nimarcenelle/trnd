import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Rival, SourceHealth } from "@/lib/db/types";

/**
 * Record what the last pull from one source found for a rival. A separate
 * write whose failure is only logged, so scans keep running on a database
 * without the health column (0108) yet.
 */
export async function recordHealth(sb: SupabaseClient, rival: Rival, source: "ads" | "site", health: Omit<SourceHealth, "at">): Promise<void> {
  rival.health = { ...(rival.health ?? {}), [source]: { at: new Date().toISOString(), ...health } };
  const { error } = await sb.from("rivals").update({ health: rival.health }).eq("id", rival.id);
  if (error) console.warn(`[health] ${rival.name} ${source} not saved:`, error.message);
}
