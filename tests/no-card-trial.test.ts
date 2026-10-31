import { describe, expect, it, vi } from "vitest";

/** The card-free trial: the two-day reminder and a plan picked mid-trial waiting for the trial to end. */

vi.mock("@/lib/env", () => ({ isStripeConfigured: true }));
process.env.TRIAL_REQUIRES_CARD = "0";
const { carriedTrialEnd, planState, trialReminderDue } = await import("@/lib/billing");

const now = Date.parse("2026-11-01T10:00:00Z");
const h = 3_600_000;
const at = (ms: number) => new Date(now + ms).toISOString();
const base = { plan: "trial", plan_status: "active" as const, trial_used_at: null, trial_reminder_for: null };

describe("no-card trial", () => {
  it("runs from sign-up with no card and locks when it ends", () => {
    expect(planState({ ...base, trial_ends_at: at(5 * 24 * h) }, now)).toMatchObject({ trialing: true, locked: false, trialDaysLeft: 5 });
    expect(planState({ ...base, trial_ends_at: at(-h) }, now)).toMatchObject({ trialing: false, locked: true });
  });

  it("reminds within two days of the end, once per end date", () => {
    expect(trialReminderDue({ ...base, trial_ends_at: at(47 * h) }, now)).toBe(true);
    expect(trialReminderDue({ ...base, trial_ends_at: at(49 * h) }, now)).toBe(false);
    expect(trialReminderDue({ ...base, trial_ends_at: at(-h) }, now)).toBe(false);
    expect(trialReminderDue({ ...base, trial_ends_at: at(47 * h), trial_reminder_for: at(47 * h) }, now)).toBe(false);
  });

  it("doesn't remind someone who already picked a plan", () => {
    expect(trialReminderDue({ ...base, plan: "monthly", plan_status: "trialing", trial_ends_at: at(24 * h) }, now)).toBe(false);
  });

  it("starts a plan picked mid-trial at the trial's end, or now when under 48 hours are left", () => {
    expect(carriedTrialEnd({ trial_ends_at: at(5 * 24 * h) }, now)).toBe(Math.floor((now + 5 * 24 * h) / 1000));
    expect(carriedTrialEnd({ trial_ends_at: at(47 * h) }, now)).toBeNull();
    expect(carriedTrialEnd({ trial_ends_at: at(-h) }, now)).toBeNull();
  });
});
