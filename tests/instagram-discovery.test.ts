import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../lib/env";
import { fetchInstagramPosts, graphBaseFor, toDiscoveryPosts, type DiscoveryResponse } from "../lib/social/instagram";

const answer: DiscoveryResponse = {
  business_discovery: {
    username: "jolieskinco",
    followers_count: 120_000,
    media_count: 900,
    media: {
      data: [
        { id: "1", caption: "Hard water is wrecking your hair. Here is the fix.", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-09-15T10:00:00+0000", like_count: 1200, comments_count: 40 },
        { id: "2", caption: "20% off this weekend only", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", permalink: "https://www.instagram.com/p/def/", timestamp: "2026-09-14T10:00:00+0000", comments_count: 3 },
        { caption: "no id, no row" },
      ],
    },
  },
};

describe("Instagram through Business Discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps the endpoint's media into social drafts, hidden likes as zero", () => {
    const posts = toDiscoveryPosts(answer);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ platform: "instagram", external_id: "1", url: "https://www.instagram.com/reel/abc/", media_type: "video", likes: 1200, comments: 40, views: 0, is_ad: false });
    expect(posts[0].posted_at).toBe("2026-09-15T10:00:00.000Z");
    expect(posts[1]).toMatchObject({ external_id: "2", media_type: "carousel", likes: 0, comments: 3, kind: "promo" });
  });

  it("speaks to graph.instagram.com for an Instagram Login token and graph.facebook.com for a Facebook one", () => {
    expect(graphBaseFor("IGAAxyz")).toContain("graph.instagram.com");
    expect(graphBaseFor("EAAxyz")).toContain("graph.facebook.com");
  });

  it("uses the free answer and never starts the paid actor when the endpoint answers", async () => {
    const paid = vi.fn(async () => JSON.stringify([]));
    const posts = await fetchInstagramPosts("jolieskinco", { fetchText: paid, discovery: async () => toDiscoveryPosts(answer) });
    expect(posts).toHaveLength(2);
    expect(paid).not.toHaveBeenCalled();
  });

  it("falls back to the paid actor only when the endpoint could not answer for the handle", async () => {
    const token = env.apifyToken;
    env.apifyToken = "test-token";
    try {
      const paid = vi.fn(async () => JSON.stringify([{ username: "x", latestPosts: [{ id: "p9", shortCode: "p9", caption: "hi", type: "Image", likesCount: 1, commentsCount: 0 }] }]));
      const posts = await fetchInstagramPosts("somepersonalaccount", { fetchText: paid, discovery: async () => null });
      expect(paid).toHaveBeenCalledTimes(1);
      expect(posts).toHaveLength(1);
      expect(posts[0].external_id).toBe("p9");
    } finally {
      env.apifyToken = token;
    }
  });

  it("returns nothing, and pays nothing, when neither reader is configured", async () => {
    const token = env.apifyToken;
    env.apifyToken = "";
    try {
      const paid = vi.fn(async () => "[]");
      expect(await fetchInstagramPosts("anyone", { fetchText: paid, discovery: async () => null })).toEqual([]);
      expect(paid).not.toHaveBeenCalled();
    } finally {
      env.apifyToken = token;
    }
  });
});
