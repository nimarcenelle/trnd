import "server-only";

import { cache } from "react";

import { createServerSupabase } from "@/lib/db/supabase";

export interface SessionUser {
  id: string;
  email: string;
}

/** Who is signed in. Memoized per request: the layout and the page both ask. */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
});
