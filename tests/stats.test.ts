import { describe, expect, it } from "vitest";

import { angleMix, angleShares, leadAngle, weeklyLaunches } from "@/lib/stats";

const now = Date.parse("2026-10-12T12:00:00Z");

describe("weeklyLaunches", () => {
  it("buckets start dates by week, this week last", () => {
    const ads = [{ started_at: "2026-10-11" }, { started_at: "2026-10-10" }, { started_at: "2026-09-30" }, { started_at: "2025-01-01" }, { started_at: null }];
    // Sep 30 is 12 days back: last week. Two this week. 2025 is out of range.
    expect(weeklyLaunches(ads, 4, now)).toEqual([0, 0, 1, 2]);
  });
});

describe("angleMix", () => {
  it("counts live ads per angle, case-insensitively, most-used first", () => {
    const ads = [
      { angle: "UGC testimonial", active: true },
      { angle: "ugc testimonial", active: true },
      { angle: "price anchor", active: true },
      { angle: "price anchor", active: false },
      { angle: null, active: true },
    ];
    expect(angleMix(ads)).toEqual([
      ["ugc testimonial", 2],
      ["price anchor", 1],
    ]);
  });
});

describe("angleShares", () => {
  const ad = (angle: string | null, active = true) => ({ angle, active });
  it("compares the brand's share of each angle with the average rival's", () => {
    const you = [ad("Style"), ad("style"), ad("collab"), ad("price anchor")];
    const rivals = [
      { name: "Fenn", ads: [ad("social proof"), ad("social proof"), ad("style"), ad("price anchor")] },
      { name: "Halo", ads: [ad("social proof"), ad("style", false)] },
      { name: "Marlow", ads: [ad("social proof", false)] },
    ];
    const rows = angleShares(you, rivals);
    // Marlow has nothing live, so the average is over Fenn and Halo.
    expect(rows.map((r) => r.angle)).toEqual(["social proof", "style", "price anchor", "collab"]);
    const proof = rows[0];
    expect(proof.you).toBe(0);
    expect(proof.rivals).toBeCloseTo(0.75);
    expect(proof.top).toEqual({ name: "Halo", share: 1, count: 1 });
    expect(proof.read).toBe("gap");
    expect(rows[1]).toMatchObject({ you: 0.5, rivals: 0.125, read: "lead" });
    expect(rows[2]).toMatchObject({ you: 0.25, rivals: 0.125, read: "lead" });
    expect(rows[3]).toMatchObject({ top: null, rivals: 0 });
  });

  it("reads within ten points as even", () => {
    const rows = angleShares([ad("ugc"), ad("x"), ad("x"), ad("x"), ad("x")], [{ name: "Fenn", ads: [ad("ugc"), ad("y"), ad("y"), ad("y")] }]);
    expect(rows.find((r) => r.angle === "ugc")?.read).toBe("par");
  });
});

describe("leadAngle", () => {
  it("picks the most-shared angle, stopped ads included", () => {
    expect(leadAngle([{ angle: "Social proof" }, { angle: "social proof" }, { angle: "price anchor" }])).toBe("social proof");
    expect(leadAngle([{ angle: null }])).toBeNull();
  });
});
