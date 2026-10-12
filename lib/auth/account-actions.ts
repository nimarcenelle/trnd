"use server";

import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

export interface AccountFormState {
  error?: string;
  notice?: string;
}

/** "Forgot password?": emails a recovery link that lands on /auth/reset. */
export async function requestPasswordResetAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/auth/reset` });
  if (error) return { error: error.message };
  return { notice: "Check your email for the reset link." };
}

/** Set a new password from a recovery-link session. */
export async function completePasswordResetAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (next.length < 8) return { error: "Password must be at least 8 characters." };
  if (next !== confirm) return { error: "Passwords don't match." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  redirect("/app");
}
