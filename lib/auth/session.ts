import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/db/supabase/clients";

import { DEMO_SESSION_COOKIE, verifySessionToken } from "./demo";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * The one way the app asks "who is signed in?" — mode-agnostic. Memoized
 * per request: `auth.getUser()` is a round trip to the auth server, and the
 * layout and the page under it both ask.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    };
  }
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (!userId) return null;
  const { loadStore } = await import("@/lib/db/demo/store");
  const user = loadStore().users.find((u) => u.id === userId);
  if (!user) return null;
  return { id: user.id, email: user.email, fullName: user.full_name };
});
