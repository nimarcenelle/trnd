import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { isStripeConfigured } from "@/lib/env";
import { disconnect } from "@/lib/tiktok/connect";

/**
 * Deletes an account for good: the subscription stops first (so nobody is
 * charged for an account that's gone), then the TikTok connection is revoked,
 * then the user. Every table hangs off the user with on-delete cascade, so the
 * creator, peers, videos, snapshots, plans and ideas go with it.
 */
export async function deleteAccount(userId: string, creator: Pick<Creator, "id" | "stripe_subscription_id" | "tiktok_connected_at"> | null): Promise<void> {
  if (creator?.stripe_subscription_id && isStripeConfigured) {
    const { getStripe } = await import("@/lib/billing/stripe");
    await getStripe()
      .subscriptions.cancel(creator.stripe_subscription_id)
      .catch((e: { code?: string; message?: string }) => {
        // Already canceled or gone is fine; anything else stops the delete, so billing never outlives the account.
        if (e.code !== "resource_missing" && !/canceled/i.test(e.message ?? "")) throw new Error(`Canceling the subscription failed: ${e.message}`);
      });
  }
  if (creator?.tiktok_connected_at) await disconnect(creator.id).catch((e) => console.warn("[delete] TikTok revoke:", (e as Error).message));
  const { error } = await adminSupabase().auth.admin.deleteUser(userId);
  if (error) throw new Error(`Deleting the account failed: ${error.message}`);
}
