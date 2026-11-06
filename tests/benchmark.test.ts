import { describe, expect, it } from "vitest";

import { benchmarkFrom, gapLine, nicheTag, type RawNichePost } from "@/lib/creator/benchmark";
import { mapInstagramPost, mapTiktokVideo } from "@/lib/creator/niche";
import { creatorStats } from "@/lib/creator/stats";

const stats = creatorStats(
  [100, 120, 80, 100, 90, 110].map((likes, i) => ({ url: null, caption: `p${i}`, posted_at: new Date(Date.UTC(2026, 9, i + 1)).toISOString(), likes, comments: 0, views: null, kind: "video" })),
)!; // median 100

const raw = (handle: string, likes: number, followers: number | null = null): RawNichePost => ({ handle, followers, caption: `${handle} post`, likes, comments: 0, shares: 0, views: null, url: null });

describe("nicheTag", () => {
  it("uses the niche typed, as a hashtag", () => {
    expect(nicheTag("Home Workouts", [])).toBe("homeworkouts");
  });
  it("else the creator's most used specific hashtag, skipping the generic ones", () => {
    expect(nicheTag("", ["Day 3 #fyp #homeworkout", "#viral #homeworkout legs", "#fyp abs"])).toBe("homeworkout");
  });
  it("says nothing from a hashtag used once", () => {
    expect(nicheTag("", ["#homeworkout once", "no tags"])).toBeNull();
  });
});

describe("benchmarkFrom", () => {
  it("keeps each creator's best post, leaves the creator out, and measures the gap", () => {
    const b = benchmarkFrom([raw("a", 5000, 10000), raw("a", 9000, 10000), raw("b", 3000, 5000), raw("c", 1000, 2000), raw("me", 99999, 10)], { handle: "me", followers: 1000, stats, tag: "homeworkout", platform: "tiktok" })!;
    expect(b.posts.map((p) => p.handle)).toEqual(["a", "b", "c"]);
    expect(b.topMedian).toBe(3000);
    expect(b.gap).toBe(30);
    expect(b.posts[0].timesYou).toBe(90);
    // Their rates 0.9, 0.6, 0.5 → median 0.6; mine 100/1000 = 0.1 → 6×.
    expect(b.perFollowerGap).toBe(6);
    expect(gapLine(b)).toBe("Per follower, the top #homeworkout posts pull 6× what your usual post does.");
  });
  it("needs three creators, and has no per-follower gap without counts", () => {
    expect(benchmarkFrom([raw("a", 10), raw("b", 10)], { handle: "me", followers: 100, stats, tag: "x", platform: "instagram" })).toBeNull();
    const b = benchmarkFrom([raw("a", 500), raw("b", 400), raw("c", 300)], { handle: "me", followers: 100, stats, tag: "x", platform: "instagram" })!;
    expect(b.perFollowerGap).toBeNull();
    expect(gapLine(b, "their")).toBe("The top #x posts get 4× their usual post.");
  });
});

describe("niche mappers", () => {
  it("maps a TikTok hashtag video with its author's followers", () => {
    expect(mapTiktokVideo({ text: "Hi", diggCount: 10, commentCount: 2, shareCount: 1, playCount: 99, webVideoUrl: "u", authorMeta: { name: "Dre", fans: 500 } })).toEqual({
      handle: "dre",
      followers: 500,
      caption: "Hi",
      likes: 10,
      comments: 2,
      shares: 1,
      views: 99,
      url: "u",
    });
  });
  it("maps an Instagram hashtag post, which carries no followers", () => {
    expect(mapInstagramPost({ ownerUsername: "Vera", caption: "c", likesCount: 5, commentsCount: 1, url: "u" }).followers).toBeNull();
  });
});
