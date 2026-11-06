import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isStripeConfigured: true }));

const now = Date.parse("2026-11-06T12:00:00Z");
const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
const ev = (kind: string, creator_id: string | null, meta: Record<string, unknown> = {}, daysAgo = 1) => ({ kind, creator_id, meta, created_at: at(daysAgo) });

describe("metrics", () => {
  it("follows a handle through to paid, and reads the mix and churn", async () => {
    const { metrics } = await import("@/lib/metrics");
    const events = [
      ev("preview_started", null, { handle: "a" }),
      ev("preview_started", null, { handle: "b" }),
      ev("preview_started", null, { handle: "c", blocked: true }),
      ev("account_created", "A"),
      ev("plan_viewed", "A", { age_days: 0 }),
      ev("paid", "A", { plan: "creator_year" }),
      ev("plan_viewed", "OLD", { age_days: 8 }, 30),
      ev("scorecard_opened", "A"),
      ev("share_card", null),
      ev("canceled", "Z", { plan: "creator_month", days: 40 }),
    ];
    const creators = [
      { id: "A", plan: "creator_year", plan_status: "active", created_at: at(1) },
      { id: "OLD", plan: "monthly", plan_status: "active", created_at: at(40) },
      { id: "Y", plan: "creator_month", plan_status: "active", created_at: at(50) },
    ];
    const m = metrics(events, creators, { checked: new Set(["A", "OLD"]), now });
    expect(m.handleToAccount).toMatchObject({ n: 1, of: 2 });
    expect(m.accountToPlan.rate).toBe(1);
    expect(m.planToPaid).toMatchObject({ n: 1, of: 1 });
    expect(m.paidByTier).toEqual({ creator: 1 });
    expect(m.mix).toEqual({ month: 1, year: 1, legacy: 1 });
    expect(m.week2).toMatchObject({ n: 1, of: 2 });
    expect(m.scorecard).toMatchObject({ n: 1, of: 2 });
    expect(m.share).toMatchObject({ n: 1, of: 2 });
    expect(m.churn.creator_month).toMatchObject({ n: 1, of: 2 });
  });
});
