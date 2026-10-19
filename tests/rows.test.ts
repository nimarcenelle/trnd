import { describe, expect, it } from "vitest";

import { allRows } from "@/lib/db/rows";

describe("allRows", () => {
  it("reads past the 1,000-row page cap until a short page", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const asked: [number, number][] = [];
    const got = await allRows((from, to) => {
      asked.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });
    expect(got).toHaveLength(2345);
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it("throws a query error instead of returning a partial list", async () => {
    await expect(allRows(() => Promise.resolve({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
