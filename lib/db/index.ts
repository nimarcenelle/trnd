import "server-only";

import { isSupabaseConfigured, warnDemoModeOnce } from "@/lib/env";

import { createDemoRepo } from "./demo/repo";
import type { Repo } from "./repo";
import { createServerSupabase } from "./supabase/clients";
import { createSupabaseRepo } from "./supabase/repo";

export { getAdminRepo } from "./admin";
export type { Repo } from "./repo";
export * from "./types";

/**
 * Repo scoped to the signed-in user. In Supabase mode queries run under RLS
 * via the request's session; in demo mode the same ownership rules are
 * enforced in code (see DECISIONS.md — the swap is loud, not silent).
 */
export async function getUserRepo(userId: string): Promise<Repo> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    return createSupabaseRepo(sb);
  }
  warnDemoModeOnce();
  return createDemoRepo({ kind: "user", userId });
}

/** Anonymous repo for the public demo-request form. */
export async function getAnonRepo(): Promise<Repo> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    return createSupabaseRepo(sb);
  }
  warnDemoModeOnce();
  return createDemoRepo({ kind: "admin" });
}
