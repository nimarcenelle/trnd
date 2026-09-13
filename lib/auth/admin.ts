import "server-only";

import { env } from "@/lib/env";

import { getSessionUser, type SessionUser } from "./session";

/**
 * Gate for /admin surfaces (internal growth tools). Fails closed: an empty
 * ADMIN_EMAILS grants nobody access, so a missing env var cannot open the
 * prospector to every signed-in user — it sends real email from our domain.
 */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (env.adminEmails.length === 0) return null;
  return env.adminEmails.includes(user.email.toLowerCase()) ? user : null;
}
