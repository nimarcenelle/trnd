import { describe, expect, it } from "vitest";

import { planSwaps, rankCandidates } from "@/lib/rivals";

const c = (name: string, directness: number) => ({ name, directness });

describe("which candidates take the seats", () => {
  it("seats the most direct first, keeps the model's order among equals, and holds the rest as spares", () => {
    const { seated, spares } = rankCandidates([c("Culligan", 1), c("Hello Klean", 5), c("Afina", 5), c("Sproos", 4), c("Aquasana", 1), c("Cobbe", 3)], 4);
    expect(seated.map((p) => p.name)).toEqual(["Hello Klean", "Afina", "Sproos", "Cobbe"]);
    expect(spares.map((p) => p.name)).toEqual(["Culligan", "Aquasana"]);
  });
  it("lets an adjacent brand in only when direct ones run out", () => {
    expect(rankCandidates([c("Culligan", 1), c("Hello Klean", 5)], 2).seated.map((p) => p.name)).toEqual(["Hello Klean", "Culligan"]);
  });
});

describe("swapping a seat that runs no ads", () => {
  const spares = [
    { name: "Cobbe", website: "cobbe.com", reason: "", directness: 4 },
    { name: "Weddell", website: "weddellwater.com", reason: "", directness: 5 },
  ];
  it("gives an idle seat to the most direct spare, one each, and leaves the owner's picks alone", () => {
    const rivals = [
      { id: "1", name: "Vitaclean", source: "ai" as const, page_id: "p1" },
      { id: "2", name: "Sprite", source: "ai" as const, page_id: null },
      { id: "3", name: "Mine", source: "owner" as const, page_id: null },
      { id: "4", name: "Afina", source: "ai" as const, page_id: "p4" },
    ];
    const ads: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 40 };
    const swaps = planSwaps(rivals, (id) => ads[id] ?? 0, spares);
    expect(swaps.map((s) => `${s.out.name}->${s.in.name}`)).toEqual(["Vitaclean->Weddell", "Sprite->Cobbe"]);
  });
  it("swaps nothing without spares or without idle seats", () => {
    expect(planSwaps([{ id: "1", name: "A", source: "ai" as const, page_id: "p" }], () => 10, spares)).toEqual([]);
    expect(planSwaps([{ id: "1", name: "A", source: "ai" as const, page_id: null }], () => 0, [])).toEqual([]);
  });
});
