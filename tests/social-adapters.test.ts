import { describe, expect, it } from "vitest";

import { readX, xSeries } from "../lib/signals/adapters/x";

const now = new Date("2026-09-12T12:00:00Z");
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();

describe("X recent-search read", () => {
  const buckets = [
    { start: at(6), tweet_count: 10 },
    { start: at(5), tweet_count: 12 },
    { start: at(4), tweet_count: 8 },
    { start: at(3), tweet_count: 30 },
    { start: at(2), tweet_count: 40 },
    { start: at(1), tweet_count: 50 },
  ];

  it("splits the seven-day window into halves it can honestly compare", () => {
    const read = readX(buckets);
    expect(read.postsPrev).toBe(30);
    expect(read.posts).toBe(120);
    expect(read.deltaPct).toBe(200);
  });

  it("reports no delta rather than a spike when the earlier half is empty", () => {
    const read = readX([{ start: at(1), tweet_count: 50 }]);
    expect(read.posts).toBe(50);
    expect(read.deltaPct).toBeNull();
  });

  it("counts reactions and names the post that travelled furthest", () => {
    const read = readX(buckets, [
      { id: "a", text: "small", public_metrics: { like_count: 2, reply_count: 1 } },
      { id: "b", text: "big", public_metrics: { like_count: 90, retweet_count: 30, quote_count: 5 } },
    ]);
    expect(read.reactions).toBe(128);
    expect(read.top?.id).toBe("b");
  });

  it("survives a sample with no metrics at all", () => {
    const read = readX(buckets, [{ id: "a", text: "bare" }]);
    expect(read.reactions).toBe(0);
    expect(read.top?.id).toBe("a");
  });

  it("draws a daily line the tracker can use", () => {
    const series = xSeries(readX(buckets), "post game drinks", "US-NC");
    expect(series).toHaveLength(6);
    expect(series[0].day < series[series.length - 1].day).toBe(true);
    expect(series.every((p) => p.term === "post game drinks")).toBe(true);
  });
});

describe("widening must not change the subject", () => {
  it("strips locality tokens in both modes", async () => {
    const { coreTerm } = await import("../lib/signals/adapters/trends-iot");
    expect(coreTerm("espresso bar near me", [])).toBe("espresso bar");
    expect(coreTerm("espresso bar near me", [], { strict: true })).toBe("espresso bar");
  });

  it("refuses to guess at the trailing word when strict", async () => {
    const { coreTerm } = await import("../lib/signals/adapters/trends-iot");
    // "post game drinks" -> "post game" measured sports chatter for a café,
    // with an NSFW top post. On a live feed a bad widen is a different
    // subject, not a broader one.
    expect(coreTerm("post game drinks", ["chapel", "hill", "nc"], { strict: true })).toBe("post game drinks");
    // The search read still widens: a broader search term is survivable.
    expect(coreTerm("post game drinks", ["chapel", "hill", "nc"])).toBe("post game");
  });
});
