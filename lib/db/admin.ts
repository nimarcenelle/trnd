/**
 * Admin (service-role) repo access with no Next.js request dependencies, so
 * it works from cron route handlers AND from `pnpm job:*` / `pnpm seed`
 * scripts run with tsx.
 */
import { isSupabaseConfigured, warnDemoModeOnce } from "@/lib/env";

import { createDemoRepo } from "./demo/repo";
import type { Repo } from "./repo";
import { createAdminSupabase } from "./supabase/admin-client";
import { createSupabaseRepo } from "./supabase/repo";

export function getAdminRepo(): Repo {
  if (isSupabaseConfigured) {
    return createSupabaseRepo(createAdminSupabase());
  }
  warnDemoModeOnce();
  return createDemoRepo({ kind: "admin" });
}
