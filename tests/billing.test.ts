import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isStripeConfigured: true }));

const now = Date.parse("2026-10-19T12:00:00Z");
const base = { plan: "trial", plan_status: "active" as const, trial_ends_at: "2026-10-25T12:00:00Z", trial_used_at: null };

describe("planState, card at trial start (default)", () => {
  it("locks a new account until a trial starts, and offers the trial", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState(base, now)).toEqual({ paid: false, trialing: false, trialDaysLeft: 0, locked: true, canTrial: true });
  });
  it("runs while trialing, with the days left from Stripe's trial end", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState({ ...base, plan: "monthly", plan_status: "trialing", trial_used_at: "2026-10-15" }, now)).toMatchObject({ trialing: true, trialDaysLeft: 6, locked: false, paid: false });
  });
  it("is paid once charging, and a canceled former trialist can't trial again", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState({ ...base, plan: "weekly", plan_status: "active", trial_used_at: "2026-09-01" }, now)).toMatchObject({ paid: true, locked: false });
    expect(planState({ ...base, plan: "weekly", plan_status: "canceled", trial_used_at: "2026-09-01" }, now)).toMatchObject({ locked: true, canTrial: false });
  });
});
