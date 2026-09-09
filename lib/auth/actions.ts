"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/db/supabase/clients";

import { createSessionToken, DEMO_SESSION_COOKIE, demoSignIn, demoSignUp } from "./demo";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

function fields(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    fullName: String(formData.get("full_name") ?? "").trim(),
  };
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password, fullName } = fields(formData);
  if (!email || !/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (!fullName) return { error: "Enter your name." };

  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message };
    // Email confirmation on: signUp succeeds but starts no session, and
    // redirecting to /onboarding would just bounce back to /login. Say what
    // actually has to happen next.
    if (!data.session) {
      return { notice: "Almost there — check your email and click the confirmation link to finish signing up." };
    }
    redirect("/onboarding");
  }

  const result = demoSignUp(email, password, fullName);
  if ("error" in result) return { error: result.error };
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, createSessionToken(result.user.id), COOKIE_OPTS);
  redirect("/onboarding");
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = fields(formData);
  if (!email) return { error: "Enter your email." };

  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    // Supabase's raw messages assume the reader knows the auth model. The
    // common real cause of "Invalid login credentials" here is an account
    // created via magic link — it has no password until one is set.
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        return {
          error:
            "That email and password don't match. If you usually sign in with an emailed link, this account may not have a password yet — use “Email me a magic link” below, or set one via “Forgot password?”.",
        };
      }
      if (/email not confirmed/i.test(error.message)) {
        return { error: "This email hasn't been confirmed yet — click the link in your signup email first." };
      }
      return { error: error.message };
    }
    redirect("/app");
  }

  const result = demoSignIn(email, password);
  if ("error" in result) return { error: result.error };
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, createSessionToken(result.user.id), COOKIE_OPTS);
  redirect("/app");
}

/** Magic link — Supabase mode only; demo mode has no mailbox to land in. */
export async function magicLinkAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email } = fields(formData);
  if (!email || !/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (!isSupabaseConfigured) {
    return {
      error: "Magic links need Supabase configured (see BLOCKED.md). Use a password for now.",
    };
  }
  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { notice: "Check your email for the sign-in link." };
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    await sb.auth.signOut();
  } else {
    const cookieStore = await cookies();
    cookieStore.delete(DEMO_SESSION_COOKIE);
  }
  redirect("/login");
}
