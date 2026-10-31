import { describe, expect, it } from "vitest";

import { callable, TREND_MIN, trendList, type TrendRow } from "@/lib/creators/stats";

/** Task 6: a trend is only labeled with enough videos this week and enough creators behind it. */

const row = (key: string, recent: number, creators: number, kind: TrendRow["kind"] = "hashtag"): TrendRow => ({ kind, key, label: `#${key}`, recent, prior: 1, views: 0, creators, stage: "rising" });

describe("trend threshold", () => {
  it("is 5", () => expect(TREND_MIN).toBe(5));

  it("calls a trend at 5 videos and 5 creators, not at 4 of either", () => {
    expect(callable(row("a", 5, 5))).toBe(true);
    expect(callable(row("a", 4, 5))).toBe(false);
    expect(callable(row("a", 5, 4))).toBe(false);
    expect(callable(row("a", 4, 4))).toBe(false);
  });

  it("moves the ones too small to call to the bottom, keeping the order otherwise", () => {
    const list = trendList([row("small", 4, 9), row("big", 12, 7), row("tiny", 1, 1), row("ok", 5, 5)]);
    expect(list.map((t) => t.key)).toEqual(["big", "ok", "small", "tiny"]);
  });

  it("leaves #fyp out entirely, in any case, and keeps a sound of the same name", () => {
    const list = trendList([row("fyp", 40, 30), row("FYP", 40, 30), row("studytok", 6, 6), row("fyp", 9, 9, "sound")]);
    expect(list.map((t) => `${t.kind}:${t.key}`)).toEqual(["hashtag:studytok", "sound:fyp"]);
  });
});
