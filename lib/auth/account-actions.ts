"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/db/supabase/clients";
import { env, isSupabaseConfigured } from "@/lib/env";

import { DEMO_SESSION_COOKIE, demoChangePassword, demoDeleteUser } from "./demo";
import { getSessionUser } from "./session";

export interface AccountFormState {
  error?: string;
  notice?: string;
}

/** Change the signed-in user's password. Works in both auth modes. */
export async function changePasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords don't match." };

  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    // Verify the current password before changing — updateUser alone would
    // let anyone at an unlocked screen take the account over.
    const { error: signInError } = await sb.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInError) return { error: "Current password is wrong." };
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) return { error: error.message };
    return { notice: "Password updated." };
  }

  const result = demoChangePassword(user.id, current, next);
  if ("error" in result) return { error: result.error };
  return { notice: "Password updated." };
}

/** "Forgot password?" — emails a recovery link in Supabase mode. */
export async function requestPasswordResetAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (!isSupabaseConfigured) {
    return {
      error:
        "Password recovery needs the email service that comes with Supabase (see BLOCKED.md). In demo mode, create a fresh account instead.",
    };
  }
  const sb = await createServerSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/auth/reset`,
  });
  if (error) return { error: error.message };
  return { notice: "Check your email for the reset link." };
}

/** Set a new password from a recovery-link session (the /auth/reset page). */
export async function completePasswordResetAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!isSupabaseConfigured) return { error: "Recovery links need Supabase configured." };
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (next.length < 8) return { error: "Password must be at least 8 characters." };
  if (next !== confirm) return { error: "Passwords don't match." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  redirect("/app");
}

/**
 * Delete the account and every row it owns. The confirm phrase is typed by
 * a human — this is the one action in the product that can't be undone.
 */
export async function deleteAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") return { error: 'Type DELETE (all caps) to confirm.' };

  if (isSupabaseConfigured) {
    // Business rows cascade from the FK graph; the auth user needs the
    // admin API. Without a service-role key we remove the data and the
    // session, and say exactly what's left.
    const sb = await createServerSupabase();
    const { getUserRepo } = await import("@/lib/db");
    const repo = await getUserRepo(user.id);
    const business = await repo.getBusinessByOwner(user.id);
    if (business) {
      const { error } = await sb.from("businesses").delete().eq("id", business.id);
      if (error) return { error: `Couldn't delete business data: ${error.message}` };
    }
    if (env.supabaseServiceRoleKey) {
      const { createAdminSupabase } = await import("@/lib/db/supabase/admin-client");
      const admin = createAdminSupabase();
      await admin.from("profiles").delete().eq("id", user.id);
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) return { error: `Business data removed, but the login couldn't be deleted: ${error.message}` };
    }
    await sb.auth.signOut();
    redirect("/?deleted=1");
  }

  demoDeleteUser(user.id);
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  redirect("/?deleted=1");
}
