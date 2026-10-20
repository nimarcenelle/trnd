"use server";

import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

function fields(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    // The handle typed on the home page, carried into setup.
    handle: String(formData.get("handle") ?? "").trim().slice(0, 60),
  };
}

const setupPath = (handle: string) => (handle ? `/app/setup?handle=${encodeURIComponent(handle)}` : "/app/setup");

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, handle } = fields(formData);
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  const sb = await createServerSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(setupPath(handle))}` },
  });
  if (error) return { error: error.message };
  // With email confirmation on, signUp starts no session: say what happens next.
  if (!data.session) return { notice: "Check your email and click the confirmation link to finish signing up." };
  redirect(setupPath(handle));
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = fields(formData);
  if (!email) return { error: "Enter your email." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      return { error: "That email and password don't match. Signed up with a magic link? Use it below, or reset your password." };
    }
    if (/email not confirmed/i.test(error.message)) return { error: "Confirm your email first: the link is in your signup email." };
    return { error: error.message };
  }
  redirect("/app");
}

export async function magicLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email } = fields(formData);
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${env.siteUrl}/auth/callback` } });
  if (error) return { error: error.message };
  return { notice: "Check your email for the sign-in link." };
}

export async function signOutAction(): Promise<void> {
  const sb = await createServerSupabase();
  await sb.auth.signOut();
  redirect("/login");
}

/** Only a path on this site may follow sign-in. */
const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/app");

/** Step 1 of passwordless sign-in: email a 6-digit code (and a link, for whoever prefers to click). */
export async function sendCodeAction(_prev: AuthFormState & { email?: string }, formData: FormData): Promise<AuthFormState & { email?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? "/app"));
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) return { error: /rate|seconds/i.test(error.message) ? "We just sent you a code. Wait a minute before asking for another." : error.message };
  return { email };
}

/** Step 2: the code from the email signs them in (and creates the account the first time). */
export async function verifyCodeAction(_prev: AuthFormState & { email?: string }, formData: FormData): Promise<AuthFormState & { email?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const next = safeNext(String(formData.get("next") ?? "/app"));
  if (token.length < 6) return { email, error: "Enter the code from the email." };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { email, error: /expired|invalid/i.test(error.message) ? "That code didn't work or has expired. Check the latest email, or send a new code." : error.message };
  redirect(next);
}

/** Continue with Google: Supabase sends them to Google and back through /auth/callback. */
export async function googleAction(formData: FormData): Promise<void> {
  const next = safeNext(String(formData.get("next") ?? "/app"));
  const sb = await createServerSupabase();
  const { data, error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error || !data.url) redirect("/login?error=auth");
  redirect(data.url);
}
