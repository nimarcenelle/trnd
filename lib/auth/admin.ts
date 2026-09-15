import "server-only";

import { env, isSupabaseConfigured } from "@/lib/env";

import { getSessionUser, type SessionUser } from "./session";

/**
 * Gate for /admin surfaces (internal growth tools). Sign-in is always
 * required, and the prospector sends real email from our domain, so in
 * production (a real database) the gate fails closed: no ADMIN_EMAILS, no
 * admin. Only the local demo store lets any signed-in user in, so the tools
 * can be developed without an email list.
 */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (env.adminEmails.length === 0) return isSupabaseConfigured ? null : user;
  return env.adminEmails.includes(user.email.toLowerCase()) ? user : null;
}
