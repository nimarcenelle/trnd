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
    // The site typed on the home page, carried into setup so it starts on its own.
    site: String(formData.get("site") ?? "").trim().slice(0, 200),
  };
}

const setupPath = (site: string) => (site ? `/app/setup?url=${encodeURIComponent(site)}` : "/app/setup");

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, site } = fields(formData);
  // The honeypot: a field no person sees. Bots fill every field, so a value
  // here is a bot, and it gets the same reply a real signup does.
  if (String(formData.get("company_website") ?? "").trim()) return { notice: "Check your email and click the confirmation link to finish signing up." };
  if (!/.+@.+\..+/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  const sb = await createServerSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(setupPath(site))}` },
  });
  if (error) return { error: error.message };
  // With email confirmation on, signUp starts no session: say what happens next.
  if (!data.session) return { notice: "Check your email and click the confirmation link to finish signing up." };
  redirect(setupPath(site));
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
