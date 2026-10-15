import { describe, expect, it } from "vitest";

import { rankCandidates } from "@/lib/rivals";

const c = (name: string, directness: number, ads: number | null) => ({ name, directness, ads });

describe("which candidates become rivals", () => {
  it("seats the most direct brands that advertise, then fills from the rest", () => {
    const picked = rankCandidates(
      [c("Culligan", 1, 50), c("Hello Klean", 5, 50), c("Vitaclean", 5, 0), c("Afina", 5, 40), c("Sproos", 4, 30), c("Aquasana", 1, 50), c("Cobbe", 4, null)],
      5,
    );
    expect(picked.map((p) => p.name)).toEqual(["Hello Klean", "Afina", "Sproos", "Cobbe", "Vitaclean"]);
  });
  it("lets an adjacent brand in only when direct ones run out", () => {
    const picked = rankCandidates([c("Culligan", 1, 50), c("Hello Klean", 5, 50)], 2);
    expect(picked.map((p) => p.name)).toEqual(["Hello Klean", "Culligan"]);
  });
  it("keeps the model's order among equals and does not drop an unchecked direct brand", () => {
    const picked = rankCandidates([c("A", 5, null), c("B", 5, null), c("C", 3, 10)], 10);
    expect(picked.map((p) => p.name)).toEqual(["A", "B", "C"]);
  });
});
