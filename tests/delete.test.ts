import { beforeEach, describe, expect, it, vi } from "vitest";

/** Deleting an account: billing stops first, and a failed cancel keeps the account. */

const steps: string[] = [];
const cancel = vi.fn(async (id: string) => void steps.push(`cancel ${id}`));

vi.mock("@/lib/env", () => ({ isStripeConfigured: true }));
vi.mock("@/lib/billing/stripe", () => ({ getStripe: () => ({ subscriptions: { cancel } }) }));
vi.mock("@/lib/tiktok/connect", () => ({ disconnect: async (id: string) => void steps.push(`revoke ${id}`) }));
vi.mock("@/lib/db/supabase", () => ({
  adminSupabase: () => ({ auth: { admin: { deleteUser: async (id: string) => (steps.push(`delete ${id}`), { error: null }) } } }),
}));

const { deleteAccount } = await import("@/lib/creators/delete");

beforeEach(() => {
  steps.length = 0;
  cancel.mockClear();
});

describe("deleteAccount", () => {
  it("cancels the subscription, revokes TikTok, then deletes the user", async () => {
    await deleteAccount("u1", { id: "c1", stripe_subscription_id: "sub_1", tiktok_connected_at: "2026-10-01" });
    expect(steps).toEqual(["cancel sub_1", "revoke c1", "delete u1"]);
  });

  it("goes ahead when the subscription is already gone", async () => {
    cancel.mockRejectedValueOnce({ code: "resource_missing", message: "No such subscription" });
    await deleteAccount("u1", { id: "c1", stripe_subscription_id: "sub_1", tiktok_connected_at: null });
    expect(steps).toEqual(["delete u1"]);
  });

  it("keeps the account when the cancel fails, so billing never outlives it", async () => {
    cancel.mockRejectedValueOnce({ code: "api_error", message: "Stripe is down" });
    await expect(deleteAccount("u1", { id: "c1", stripe_subscription_id: "sub_1", tiktok_connected_at: null })).rejects.toThrow(/Canceling/);
    expect(steps).toEqual([]);
  });

  it("deletes an account that never subscribed", async () => {
    await deleteAccount("u1", null);
    expect(steps).toEqual(["delete u1"]);
  });
});
