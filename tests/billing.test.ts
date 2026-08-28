import { describe, expect, it } from "vitest";

import { derivePlanState, TRIAL_DAYS, trialEndsAtFor } from "../lib/billing";
import type { Subscription } from "../lib/db/types";

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: "sub1",
  business_id: "b1",
  plan: "trial",
  status: "trialing",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  current_period_end: null,
  trial_ends_at: new Date(Date.now() + 5 * 86400_000).toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

describe("plan state", () => {
  it("computes the trial window from business creation", () => {
    const created = "2026-01-01T00:00:00.000Z";
    const ends = trialEndsAtFor({ created_at: created });
    expect(new Date(ends).getTime() - new Date(created).getTime()).toBe(TRIAL_DAYS * 86400_000);
  });

  it("an active trial is never locked", () => {
    const state = derivePlanState(sub(), new Date(), true);
    expect(state.isTrialing).toBe(true);
    expect(state.trialDaysLeft).toBe(5);
    expect(state.locked).toBe(false);
  });

  it("an expired trial locks only when billing is live", () => {
    const expired = sub({ trial_ends_at: new Date(Date.now() - 86400_000).toISOString() });
    expect(derivePlanState(expired, new Date(), true).locked).toBe(true);
    // Without Stripe keys there is no way to pay — never brick the install.
    expect(derivePlanState(expired, new Date(), false).locked).toBe(false);
  });

  it("a paid plan is not locked; canceled is; past_due keeps working", () => {
    const paid = sub({ plan: "baseline", status: "active", trial_ends_at: null });
    expect(derivePlanState(paid, new Date(), true).locked).toBe(false);

    const pastDue = sub({ plan: "baseline", status: "past_due", trial_ends_at: null });
    expect(derivePlanState(pastDue, new Date(), true).locked).toBe(false);

    const canceled = sub({ plan: "baseline", status: "canceled", trial_ends_at: null });
    const state = derivePlanState(canceled, new Date(), true);
    expect(state.locked).toBe(true);
    expect(state.lockedReason).toMatch(/restart/i);
  });
});
