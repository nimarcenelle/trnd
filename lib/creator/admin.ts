import "server-only";

import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";

/** /studio is for the emails in ADMIN_EMAILS. Anyone else is sent to sign in, or home. */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!env.adminEmails.includes(user.email.toLowerCase())) redirect("/");
  return user;
}
