import { describe, expect, it } from "vitest";

import { mapLimit } from "../lib/util/concurrency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("keeps at most the limit in flight and returns results in order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(ms);
      inFlight -= 1;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30]);
    expect(peak).toBe(2);
  });

  it("stops starting new work when told, leaving the rest undefined", async () => {
    let started = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 1, async (n) => {
      started += 1;
      return n;
    }, () => started >= 2);
    expect(out).toEqual([1, 2, undefined, undefined, undefined]);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
  });
});
