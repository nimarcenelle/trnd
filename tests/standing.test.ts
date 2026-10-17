import { describe, expect, it } from "vitest";

import type { Ad } from "@/lib/db/types";
import { standing } from "@/lib/standing";

let n = 0;
const ad = (rival: string, score: number | null, topic: string | null = null, active = true): Ad =>
  ({ id: `a${++n}`, rival_id: rival, score, topic, active, hook: `hook ${n}` }) as unknown as Ad;

describe("standing", () => {
  it("ranks brands by their best ads, places your best ad, and finds the topics you're missing", () => {
    const s = standing({
      companies: [
        { id: "me", name: "Halo", you: true },
        { id: "c", name: "Clearwell", you: false },
        { id: "t", name: "Tidewell", you: false },
        { id: "q", name: "Quiet", you: false },
      ],
      ads: [
        ad("me", 70, "hard water"),
        ad("me", 40, "price"),
        ad("c", 90, "eczema"),
        ad("c", 80, "hard water"),
        ad("t", 50, "price"),
        ad("t", 99, "price", false), // stopped: doesn't count
        ad("q", null),
      ],
    });
    expect(s.brands.map((b) => [b.name, b.rank, b.strength])).toEqual([
      ["Clearwell", 1, 85],
      ["Halo", 2, 55],
      ["Tidewell", 3, 50],
      ["Quiet", null, null],
    ]);
    expect(s.you?.rank).toBe(2);
    expect(s.bestAdRank).toBe(3);
    expect(s.totalAds).toBe(5);
    expect(s.topics.map((t) => [t.topic, t.yours])).toEqual([
      ["eczema", false],
      ["hard water", true],
      ["price", true],
    ]);
  });
});
