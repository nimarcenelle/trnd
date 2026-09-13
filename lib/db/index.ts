import "server-only";

import { cache } from "react";

import { isSupabaseConfigured, warnDemoModeOnce } from "@/lib/env";

import { createDemoRepo } from "./demo/repo";
import type { Repo } from "./repo";
import { createServerSupabase } from "./supabase/clients";
import { createSupabaseRepo } from "./supabase/repo";

export { getAdminRepo } from "./admin";
export type { Repo } from "./repo";
export * from "./types";

/**
 * The reads the layout and every page under it both make, remembered for
 * the life of one request. A write to the same row in the same request is
 * rare (the trial row's first upsert) and returns the row it wrote, so a
 * stale memo cannot be read after it.
 */
function rememberOwnerReads(repo: Repo): Repo {
  const business = new Map<string, ReturnType<Repo["getBusinessByOwner"]>>();
  const subscription = new Map<string, ReturnType<Repo["getSubscription"]>>();
  return {
    ...repo,
    getBusinessByOwner(ownerId) {
      let hit = business.get(ownerId);
      if (!hit) {
        hit = repo.getBusinessByOwner(ownerId);
        business.set(ownerId, hit);
      }
      return hit;
    },
    getSubscription(businessId) {
      let hit = subscription.get(businessId);
      if (!hit) {
        hit = repo.getSubscription(businessId);
        subscription.set(businessId, hit);
      }
      return hit;
    },
    upsertSubscription(row) {
      subscription.delete(row.business_id);
      return repo.upsertSubscription(row);
    },
  };
}

/**
 * Repo scoped to the signed-in user. In Supabase mode queries run under RLS
 * via the request's session; in demo mode the same ownership rules are
 * enforced in code (see DECISIONS.md — the swap is loud, not silent).
 * One per request: the layout and the page share it, so the business and
 * subscription rows are read once, not once per component.
 */
export const getUserRepo = cache(async function getUserRepo(userId: string): Promise<Repo> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    return rememberOwnerReads(createSupabaseRepo(sb));
  }
  warnDemoModeOnce();
  return rememberOwnerReads(createDemoRepo({ kind: "user", userId }));
});

/** Anonymous repo for the public demo-request form. */
export async function getAnonRepo(): Promise<Repo> {
  if (isSupabaseConfigured) {
    const sb = await createServerSupabase();
    return createSupabaseRepo(sb);
  }
  warnDemoModeOnce();
  return createDemoRepo({ kind: "admin" });
}
