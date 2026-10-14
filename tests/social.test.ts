import { describe, expect, it } from "vitest";

import { engagementRate, growthBy, mapInstagram, mapTiktok, normHandle, postsPerWeek } from "@/lib/social/read";
import { extractSocials } from "@/lib/site";

describe("extractSocials", () => {
  it("finds the brand's own handles in footer links, skipping post and reel links", () => {
    const html = `<a href="https://www.instagram.com/p/Cx1/">post</a>
      <a href="https://instagram.com/halo.shower/">IG</a>
      <a href="https://www.tiktok.com/@haloshower?lang=en">TT</a>`;
    expect(extractSocials(html)).toEqual({ instagram: "halo.shower", tiktok: "haloshower", facebook: null });
  });
  it("returns nulls when the site links neither", () => {
    expect(extractSocials("<footer>© Halo</footer>")).toEqual({ instagram: null, tiktok: null, facebook: null });
  });
});

describe("normHandle", () => {
  it("accepts @handles and profile URLs", () => {
    expect(normHandle("@Halo.Shower")).toBe("halo.shower");
    expect(normHandle("https://www.tiktok.com/@haloshower?lang=en")).toBe("haloshower");
    expect(normHandle("https://instagram.com/halo/")).toBe("halo");
  });
});

describe("mapInstagram", () => {
  it("maps a profile item and its latest posts", () => {
    const read = mapInstagram({
      username: "Halo",
      fullName: "Halo Shower",
      followersCount: 12000,
      followsCount: 300,
      postsCount: 410,
      latestPosts: [{ url: "https://instagram.com/p/1", caption: "Soft water", timestamp: "2026-10-10T10:00:00Z", likesCount: 240, commentsCount: 12, type: "Video", videoViewCount: 9000 }],
    });
    expect(read).toMatchObject({ platform: "instagram", handle: "halo", followers: 12000, posts: 410 });
    expect(read!.recent[0]).toMatchObject({ likes: 240, comments: 12, views: 9000, kind: "Video", posted_at: "2026-10-10T10:00:00.000Z" });
  });
  it("drops an item with no username instead of throwing", () => {
    expect(mapInstagram({ followersCount: 3 })).toBeNull();
  });
});

describe("mapTiktok", () => {
  it("groups video items by author", () => {
    const reads = mapTiktok([
      { text: "a", diggCount: 10, commentCount: 1, playCount: 500, createTimeISO: "2026-10-10T00:00:00Z", webVideoUrl: "u1", authorMeta: { name: "Halo", fans: 5000, video: 80 } },
      { text: "b", diggCount: 20, commentCount: 2, playCount: 900, createTime: 1760000000, authorMeta: { name: "halo", fans: 5000 } },
    ]);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ platform: "tiktok", handle: "halo", followers: 5000, posts: 80 });
    expect(reads[0].recent).toHaveLength(2);
  });
});

describe("cadence and engagement", () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  const post = (daysAgo: number, likes: number, comments = 0) => ({ url: null, caption: null, kind: null, views: null, likes, comments, posted_at: new Date(now - daysAgo * 86_400_000).toISOString() });
  it("posts per week over the span the posts cover", () => {
    expect(postsPerWeek([post(1, 0), post(4, 0), post(7, 0), post(14, 0)], now)).toBe(2);
    expect(postsPerWeek([post(1, 0)], now)).toBeNull();
  });
  it("engagement is mean likes + comments over followers", () => {
    expect(engagementRate([post(1, 90, 10), post(2, 190, 10)], 10_000)).toBe(0.015);
    expect(engagementRate([post(1, 90)], null)).toBeNull();
  });
});

describe("growthBy", () => {
  it("first and last snapshot per profile, in date order", () => {
    const g = growthBy([
      { profile_id: "a", followers: 1100, captured_on: "2026-10-14" },
      { profile_id: "a", followers: 1000, captured_on: "2026-10-01" },
      { profile_id: "b", followers: 50, captured_on: "2026-10-10" },
    ]);
    expect(g.get("a")).toEqual({ from: 1000, to: 1100, days: 13 });
    expect(g.get("b")).toEqual({ from: 50, to: 50, days: 0 });
  });
});
