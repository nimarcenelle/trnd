import "server-only";

import { env, isSupabaseConfigured } from "@/lib/env";

import { getSessionUser, type SessionUser } from "./session";

/**
 * Gate for /admin surfaces (internal growth tools). With Supabase configured
 * an ADMIN_EMAILS entry is required; in local demo mode any signed-in demo
 * user counts — the developer at the keyboard IS the admin.
 */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isSupabaseConfigured && env.adminEmails.length === 0) return user;
  return env.adminEmails.includes(user.email.toLowerCase()) ? user : null;
}
