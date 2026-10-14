import { afterEach, describe, expect, it, vi } from "vitest";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** lib/env reads process.env at import, so each case loads billing fresh. */
async function load(stripe: boolean) {
  vi.resetModules();
  vi.stubEnv("STRIPE_SECRET_KEY", stripe ? "sk_test" : "");
  vi.stubEnv("STRIPE_PRICE_GROWTH", stripe ? "price_growth" : "");
  vi.stubEnv("STRIPE_PRICE_STARTER", stripe ? "price_starter" : "");
  vi.stubEnv("STRIPE_PRICE", "");
  return import("@/lib/billing");
}

afterEach(() => vi.unstubAllEnvs());

describe("planState", () => {
  it("makes a new brand pick a plan before its first scan", async () => {
    const { planState } = await load(true);
    const s = planState({ plan: "trial", plan_status: "active", trial_ends_at: iso(NOW + 14 * DAY), last_scan_at: null }, NOW);
    expect(s).toMatchObject({ needsPlan: true, locked: true, paid: false, trialDaysLeft: 0 });
  });

  it("lets a brand already on the old card-free trial finish it", async () => {
    const { planState } = await load(true);
    const live = planState({ plan: "trial", plan_status: "active", trial_ends_at: iso(NOW + 3 * DAY), last_scan_at: iso(NOW - DAY) }, NOW);
    expect(live).toMatchObject({ needsPlan: false, locked: false, trialDaysLeft: 3, tier: "growth" });
    const over = planState({ plan: "trial", plan_status: "active", trial_ends_at: iso(NOW - DAY), last_scan_at: iso(NOW - DAY) }, NOW);
    expect(over).toMatchObject({ locked: true, needsPlan: false });
  });

  it("treats a subscription in its Stripe trial as paid, and shows the days left", async () => {
    const { planState } = await load(true);
    const s = planState({ plan: "starter", plan_status: "active", trial_ends_at: iso(NOW + 10 * DAY), last_scan_at: null }, NOW);
    expect(s).toMatchObject({ paid: true, locked: false, needsPlan: false, tier: "starter", trialDaysLeft: 10 });
  });

  it("locks a failed or canceled subscription", async () => {
    const { planState } = await load(true);
    expect(planState({ plan: "growth", plan_status: "past_due", trial_ends_at: iso(NOW - DAY), last_scan_at: iso(NOW) }, NOW).locked).toBe(true);
    expect(planState({ plan: "starter", plan_status: "canceled", trial_ends_at: iso(NOW - DAY), last_scan_at: iso(NOW) }, NOW).locked).toBe(true);
  });

  it("never locks without Stripe", async () => {
    const { planState } = await load(false);
    expect(planState({ plan: "trial", plan_status: "active", trial_ends_at: iso(NOW - DAY), last_scan_at: null }, NOW)).toMatchObject({ locked: false, needsPlan: false });
  });
});

describe("tiers", () => {
  it("prices the old single plan like Growth and maps Stripe prices back to tiers", async () => {
    const { tierOf, rivalLimit, tierForPrice } = await load(true);
    expect(tierOf("pro")).toBe("growth");
    expect(rivalLimit({ plan: "starter" })).toBe(3);
    expect(rivalLimit({ plan: "pro" })).toBe(10);
    expect(tierForPrice("price_starter")).toBe("starter");
    expect(tierForPrice("price_growth")).toBe("growth");
    expect(tierForPrice("price_other")).toBeNull();
  });
});
