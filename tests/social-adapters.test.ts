import { describe, expect, it } from "vitest";

import { hashtagFor, readReels } from "../lib/signals/adapters/instagram";
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

describe("Instagram Reels read", () => {
  it("counts only video as a Reel", () => {
    const read = readReels(
      [
        { id: "1", media_type: "VIDEO", timestamp: at(1), like_count: 10, comments_count: 2 },
        { id: "2", media_type: "IMAGE", timestamp: at(1), like_count: 500 },
        { id: "3", media_type: "CAROUSEL_ALBUM", timestamp: at(2), like_count: 400 },
      ],
      now,
    );
    // Counting stills as short-form would inflate the one number this
    // adapter exists to report.
    expect(read.reels).toBe(1);
    expect(read.posts).toBe(3);
    expect(read.reactions).toBe(12);
  });

  it("ignores media outside the seven-day window", () => {
    const read = readReels(
      [
        { id: "1", media_type: "VIDEO", timestamp: at(2) },
        { id: "2", media_type: "VIDEO", timestamp: at(40) },
      ],
      now,
    );
    expect(read.reels).toBe(1);
  });

  it("names the Reel with the most reaction", () => {
    const read = readReels(
      [
        { id: "1", media_type: "VIDEO", timestamp: at(1), like_count: 5, permalink: "p1" },
        { id: "2", media_type: "VIDEO", timestamp: at(2), like_count: 90, comments_count: 10, permalink: "p2" },
      ],
      now,
    );
    expect(read.top?.id).toBe("2");
    expect(read.top?.reactions).toBe(100);
  });

  it("turns a term into a hashtag Instagram will accept", () => {
    expect(hashtagFor("Cold Plunge NYC")).toBe("coldplungenyc");
    expect(hashtagFor("brown-sugar oat latte!")).toBe("brownsugaroatlatte");
  });

  it("returns an empty read rather than throwing on no media", () => {
    const read = readReels([], now);
    expect(read.reels).toBe(0);
    expect(read.top).toBeNull();
    expect(read.daily).toEqual([]);
  });
});
