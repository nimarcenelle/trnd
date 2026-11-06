import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => ({}) }));

describe("freeMonthFor", () => {
  it("gives a referee their month once, then uses earned credits", async () => {
    const { freeMonthFor, isCode } = await import("@/lib/referrals");
    const base = { referred_by: null, referral_rewarded_at: null, free_months: 0, trial_used_at: null };
    expect(freeMonthFor(base)).toBeNull();
    expect(freeMonthFor({ ...base, referred_by: "r1" })).toBe("referee");
    expect(freeMonthFor({ ...base, referred_by: "r1", trial_used_at: "2026-11-01" })).toBeNull();
    expect(freeMonthFor({ ...base, free_months: 2 })).toBe("credit");
    expect(isCode("ab23cd45")).toBe(true);
    expect(isCode("../etc")).toBe(false);
  });
});
