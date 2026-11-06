import { describe, expect, it } from "vitest";

import { dollarRange, gapOf, postsPerMonth, typicalByAuthor } from "@/lib/creators/gap";

describe("gapOf", () => {
  const ahead = [
    { followers: 90_000, typical: 300_000 },
    { followers: 150_000, typical: 520_000 },
    { followers: 500_000, typical: 2_000_000 },
  ];
  it("averages the creators 2–5× the followers, and prices the gap from the reported rate range", () => {
    const g = gapOf({ followers: 40_000, typical: 78_000 }, ahead, 12)!;
    expect(g).toMatchObject({ mine: 78_000, ahead: 410_000, creators: 2, band: "2-5x", perMonth: 12 });
    // (410,000 - 78,000) × 12 / 1,000 × $0.40 and × $1.00.
    expect(g.dollars).toEqual({ low: 1590, high: 3980 });
    expect(dollarRange(g.dollars!)).toBe("$1,590–$3,980/month");
  });
  it("shows views only for an account that can't earn from Creator Rewards", () => {
    expect(gapOf({ followers: 6_000, typical: 4_000 }, [{ followers: 15_000, typical: 20_000 }, { followers: 25_000, typical: 30_000 }], 8)!.dollars).toBeNull();
  });
  it("falls back to anyone ahead when fewer than two sit in the band, and needs something to compare", () => {
    expect(gapOf({ followers: 40_000, typical: 78_000 }, [ahead[2]], 4)!.band).toBe("ahead");
    expect(gapOf({ followers: 40_000, typical: null }, ahead, 4)).toBeNull();
    expect(gapOf({ followers: 40_000, typical: 78_000 }, [{ followers: 10_000, typical: 5_000 }], 4)).toBeNull();
  });
  it("gives no dollar figure when they aren't behind", () => {
    expect(gapOf({ followers: 40_000, typical: 900_000 }, ahead, 4)!.dollars).toBeNull();
  });
});

describe("postsPerMonth", () => {
  const now = Date.parse("2026-11-06T00:00:00Z");
  it("counts the last 28 days, then the goal, then 4", () => {
    expect(postsPerMonth(["2026-11-01T00:00:00Z", "2026-10-20T00:00:00Z", "2026-09-01T00:00:00Z"], null, now)).toBe(2);
    expect(postsPerMonth([], "3-4", now)).toBe(15);
    expect(postsPerMonth([], null, now)).toBe(4);
  });
});

describe("typicalByAuthor", () => {
  it("takes each author's median", () => {
    expect(typicalByAuthor([{ author: "a", views: 1 }, { author: "a", views: 9 }, { author: "a", views: 5 }, { author: "b", views: null }]).get("a")).toBe(5);
  });
});
