import "server-only";

import { env } from "@/lib/env";

import { getSessionUser, type SessionUser } from "./session";

/**
 * Gate for /admin surfaces (internal growth tools). Any signed-in user gets
 * in until ADMIN_EMAILS is set; once it is, only those addresses do. Sign-in
 * is always required — the prospector sends real email from our domain.
 */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (env.adminEmails.length === 0) return user;
  return env.adminEmails.includes(user.email.toLowerCase()) ? user : null;
}
