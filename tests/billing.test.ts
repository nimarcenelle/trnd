import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isStripeConfigured: true }));

const now = Date.parse("2026-10-19T12:00:00Z");
const base = { plan: "trial", plan_status: "active" as const, trial_ends_at: "2026-10-25T12:00:00Z", trial_used_at: null };

describe("planState, card at trial start (default)", () => {
  it("puts a new account on the free tier, with no trial unless CREATOR_TRIAL_DAYS is set", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState(base, now)).toEqual({ paid: false, trialing: false, trialDaysLeft: 0, locked: true, canTrial: false, pastDue: false });
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
  it("keeps a past-due plan running while Stripe retries the card", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState({ ...base, plan: "monthly", plan_status: "past_due", trial_used_at: "2026-09-01" }, now)).toMatchObject({ pastDue: true, locked: false });
  });
});

describe("tiers", () => {
  it("reads the new plans, and counts the old weekly and monthly ones as Creator", async () => {
    const { paidPlanOf, planLabel } = await import("@/lib/billing");
    expect(paidPlanOf("creator_year")).toEqual({ tier: "creator", period: "year", legacy: false });
    expect(paidPlanOf("weekly")).toEqual({ tier: "creator", period: "week", legacy: true });
    expect(paidPlanOf("trial")).toBeNull();
    expect(planLabel("creator_year")).toBe("Creator · $149/year");
    expect(planLabel("monthly")).toBe("Creator · $24.99/month");
  });
  it("prices yearly against twelve months", async () => {
    const { yearlyVsMonthly, yearlyPerMonth } = await import("@/lib/billing");
    expect(yearlyVsMonthly("creator")).toBe("$149/yr vs $228 billed monthly");
    expect(yearlyPerMonth("creator")).toBe("$12.41");
  });
  it("keeps a new-style plan paid while active", async () => {
    const { planState } = await import("@/lib/billing");
    expect(planState({ ...base, plan: "creator_year", plan_status: "active" }, now)).toMatchObject({ paid: true, locked: false });
  });
});

describe("reads", () => {
  it("reads a free account at its weekly slot and a paid one daily", async () => {
    const { readDue, freeReadDue } = await import("@/lib/creators/guards");
    // Monday 2026-10-19 12:00 UTC; the last slot was Tuesday 2026-10-13 12:00 UTC (8 AM New York).
    const c = { scan_status: "idle" as const, scan_started_at: null, last_scan_at: "2026-10-17T12:00:00Z", scan_failures: 0, timezone: "America/New_York", last_plan_at: "2026-10-13T12:30:00Z" };
    expect(readDue(c, false, now)).toBe(true);
    expect(readDue(c, true, now)).toBe(false);
    expect(readDue({ ...c, last_plan_at: "2026-10-12T00:00:00Z" }, true, now)).toBe(true);
    expect(freeReadDue({ last_scan_at: null, last_plan_at: null, timezone: null }, now)).toBe(true);
  });
});
