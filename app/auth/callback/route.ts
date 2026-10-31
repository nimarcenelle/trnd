import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/next";
import { createServerSupabase } from "@/lib/db/supabase";

/** Supabase magic-link, confirmation and recovery code exchange. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` is a path only, so the redirect can never leave the site.
  const dest = safeNext(searchParams.get("next"));
  if (code) {
    const sb = await createServerSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${dest}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
