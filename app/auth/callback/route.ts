import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/db/supabase/clients";

/** Supabase magic-link / OAuth code exchange target. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Recovery links land here too — `next` names the in-app destination
  // (path only, so the redirect can never leave the site).
  const next = searchParams.get("next") ?? "";
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  if (code && isSupabaseConfigured) {
    const sb = await createServerSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${dest}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
