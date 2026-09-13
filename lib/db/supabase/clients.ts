import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/lib/env";

export { createAdminSupabase } from "./admin-client";

/**
 * Request-scoped client carrying the signed-in user's session — all queries
 * run under RLS. Only usable inside Server Components / Actions / Routes.
 * Memoized per request: the layout, the page and every helper under them
 * used to build their own client, and each one paid the cookie parse again.
 */
export const createServerSupabase = cache(async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components may not set cookies; the proxy refresh handles it.
        }
      },
    },
  });
});
