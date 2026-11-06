import { describe, expect, it } from "vitest";

import { diagnose, killerFromNumbers } from "@/lib/creators/diagnosis";

const v = (views: number, day: number, caption = `post ${day}`) => ({ views, posted_at: new Date(Date.UTC(2026, 9, day)).toISOString(), caption });

describe("diagnose", () => {
  it("counts videos that never got past their followers, oldest first, and names the worst", () => {
    const d = diagnose([v(100, 1), v(400, 2), v(30, 3, "Monday motivation #fyp"), v(90, 4), v(110, 5)], { views: 100 })!;
    expect(d.tiles).toEqual(["stuck", "breakout", "flop", "stuck", "stuck"]);
    expect(d).toMatchObject({ n: 5, breakouts: 1, stuck: 4, flopped: 1 });
    expect(d.worst).toEqual({ title: "Monday motivation", times: 0.3 });
    expect(killerFromNumbers(d)).toMatch(/one hit/);
  });
  it("needs three videos with views and a usual", () => {
    expect(diagnose([v(1, 1), v(2, 2)], { views: 1 })).toBeNull();
    expect(diagnose([v(1, 1), v(2, 2), v(3, 3)], { views: null })).toBeNull();
  });
});
