import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { adminSupabase } from "@/lib/db/supabase";

/**
 * EssayOdds's own database, so student essays never sit next to TRND's data. Set ESSAYODDS_SUPABASE_URL and
 * ESSAYODDS_SUPABASE_SERVICE_ROLE_KEY to a project that has run supabase/migrations/0200_ai_results.sql (its only table);
 * until both are set, it falls back to the shared project. Only the service role reads or writes it.
 */
let own: SupabaseClient | null = null;

export const hasOwnDatabase = () => Boolean(process.env.ESSAYODDS_SUPABASE_URL && process.env.ESSAYODDS_SUPABASE_SERVICE_ROLE_KEY);

export function essayOddsDb(): SupabaseClient {
  if (!hasOwnDatabase()) return adminSupabase();
  own ??= createClient(process.env.ESSAYODDS_SUPABASE_URL!, process.env.ESSAYODDS_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return own;
}
