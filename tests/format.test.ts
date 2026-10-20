import { describe, expect, it } from "vitest";

import { times } from "@/lib/format";

describe("times", () => {
  it("shows one decimal under 10, whole numbers from 10, and separators from 1,000", () => {
    expect([7.3, 2, 0.5, 9.94, 9.96, 10, 42.6, 999.6, 1796.4, 12_345].map(times)).toEqual(["7.3×", "2×", "0.5×", "9.9×", "10×", "10×", "43×", "1,000×", "1,796×", "12,345×"]);
  });
});
