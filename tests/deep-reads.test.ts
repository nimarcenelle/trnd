import { describe, expect, it } from "vitest";

import { postsForComments, stockUpdates } from "../lib/intel/deep-reads";
import { shopifyCatalog } from "../lib/import/catalog";
import { toTrustpilotReviews, trustpilotUrl } from "../lib/reviews/trustpilot";
import { createRedditAdapter, termSearchSignals } from "../lib/signals/adapters/reddit";
import { postExternalId, toInstagramComments, toTiktokComments } from "../lib/social/comments";
import type { SocialPost } from "../lib/db/types";

describe("comment readers", () => {
  it("maps the Instagram actor's items as they came back live", () => {
    const items = [
      { postUrl: "https://www.instagram.com/p/DNWLRRNuVu0/", id: "17992746324043335", text: "Does it work with a handheld?", ownerUsername: "mia", timestamp: "2026-09-02T15:49:27.000Z", likesCount: 3 },
      { postUrl: "https://www.instagram.com/p/DNWLRRNuVu0/", id: "17992746324043335", text: "dupe", ownerUsername: "mia" },
      { postUrl: "https://www.instagram.com/p/DNWLRRNuVu0/", id: "2", text: "   " },
      "not an item",
    ];
    const out = toInstagramComments(items);
    expect(out).toEqual([
      { platform: "instagram", post_external_id: "DNWLRRNuVu0", external_id: "17992746324043335", author: "mia", text: "Does it work with a handheld?", likes: 3, posted_at: "2026-09-02T15:49:27.000Z" },
    ]);
  });

  it("maps the TikTok actor's items as they came back live", () => {
    const items = [
      { videoWebUrl: "https://www.tiktok.com/@filter.baby/video/7672857811449138463", cid: "7673340575043617566", createTimeISO: "2026-08-13T02:40:56.000Z", text: "Love love love my filterbaby!", diggCount: 26, uniqueId: "mitzeyyyy" },
    ];
    expect(toTiktokComments(items)).toEqual([
      { platform: "tiktok", post_external_id: "7672857811449138463", external_id: "7673340575043617566", author: "mitzeyyyy", text: "Love love love my filterbaby!", likes: 26, posted_at: "2026-08-13T02:40:56.000Z" },
    ]);
  });

  it("keys a comment to the post as social_posts stores it", () => {
    expect(postExternalId("instagram", "https://www.instagram.com/reel/Abc_12-x/")).toBe("Abc_12-x");
    expect(postExternalId("tiktok", "https://www.tiktok.com/@x/video/123")).toBe("123");
    expect(postExternalId("facebook", "https://facebook.com/x/posts/9")).toBe("https://facebook.com/x/posts/9");
  });

  it("reads comments under the most engaged posts that have any", () => {
    const post = (over: Partial<SocialPost>): SocialPost =>
      ({ id: "p", business_id: "b", competitor_id: null, platform: "instagram", external_id: "e", url: "https://instagram.com/p/e/", caption: "", media_type: "image", posted_at: null, likes: 0, comments: 0, shares: 0, views: 0, is_ad: false, kind: null, captured_at: "", ...over }) as SocialPost;
    const picked = postsForComments(
      [post({ external_id: "quiet", likes: 900, comments: 0 }), post({ external_id: "loud", likes: 500, comments: 40 }), post({ external_id: "mid", likes: 100, comments: 3 }), post({ external_id: "nourl", url: "", likes: 5000, comments: 100 })],
      1,
    );
    expect(picked.map((p) => p.external_id)).toEqual(["loud"]);
  });
});

describe("stock from the store's catalog", () => {
  const catalog = shopifyCatalog({
    products: [
      { title: "Filtered Showerhead", handle: "filtered-showerhead", variants: [{ title: "Chrome", price: "149.00", available: false }, { title: "Gold", price: "159.00", available: true }] },
      { title: "Replacement Filter", handle: "filter", variants: [{ title: "Default Title", price: "29.00", available: false }] },
      { title: "Bath Mat", handle: "mat", variants: [{ title: "Default Title", price: "50.00" }] },
    ],
  });

  it("carries availability on the product when the catalog says", () => {
    expect(catalog.map((p) => [p.name, p.inStock])).toEqual([
      ["Filtered Showerhead", true],
      ["Replacement Filter", false],
      ["Bath Mat", null],
    ]);
  });

  it("updates only the services whose stock the catalog answers and changes", () => {
    const services = [
      { id: "1", business_id: "b", name: "Filtered showerhead", description: null, price_cents: 14900, is_active: true, in_stock: null },
      { id: "2", business_id: "b", name: "Replacement filter", description: null, price_cents: 2900, is_active: true, in_stock: false },
      { id: "3", business_id: "b", name: "Bath mat", description: null, price_cents: 5000, is_active: true, in_stock: null },
      { id: "4", business_id: "b", name: "Towel", description: null, price_cents: 3000, is_active: true, in_stock: null },
    ];
    expect(stockUpdates(services, catalog, "rinse")).toEqual([{ id: "1", in_stock: true }]);
  });
});

describe("Trustpilot", () => {
  it("builds the company page from any spelling of the domain", () => {
    expect(trustpilotUrl("https://www.GetCanopy.co/shop")).toBe("https://www.trustpilot.com/review/getcanopy.co");
  });

  it("maps the actor's items as they came back live, dropping the wordless and the unrated", () => {
    const items = [
      { reviewId: "6a62b478", title: "Faulty devices and bad customer service", text: "Their devices are often faulty.", rating: 1, publishedDate: "2026-07-24T02:40:24.000Z", authorName: "Julia" },
      { reviewId: "6a62b478", title: "dupe", text: "x", rating: 1 },
      { reviewId: "none", title: "", text: "", rating: 5 },
      { reviewId: "unrated", title: "Great", text: "Great", rating: null },
    ];
    expect(toTrustpilotReviews(items)).toEqual([
      { externalId: "6a62b478", author: "Julia", rating: 1, text: "Faulty devices and bad customer service. Their devices are often faulty.", publishedAt: "2026-07-24T02:40:24.000Z" },
    ]);
  });
});

describe("Reddit", () => {
  const listing = {
    data: {
      children: [
        { data: { title: "Why is my hair falling out since I moved?", selftext: "New apartment, hard water, and my hair sheds like crazy.\n\nAnyone?", score: 40, num_comments: 12, created_utc: 1, subreddit: "HaircareScience", permalink: "/r/a" } },
        { data: { title: "nsfw", selftext: "", score: 400, num_comments: 1, created_utc: 1, subreddit: "x", permalink: "/r/b", over_18: true } },
      ],
    },
  };

  it("turns a term search into conversation rows that remember the term and the body", () => {
    const rows = termSearchSignals(listing, "hard water", "shower filter brand", "US");
    expect(rows).toHaveLength(1);
    expect(rows[0].term).toBe("Why is my hair falling out since I moved?");
    expect(rows[0].raw).toMatchObject({ searched_for: "hard water", body: "New apartment, hard water, and my hair sheds like crazy. Anyone?", subreddit: "HaircareScience" });
  });

  it("reads the brand's own communities when given them, and the stock boards only when given none", async () => {
    const urls: string[] = [];
    const fetchJson = (async (url: string) => {
      urls.push(url);
      return listing;
    }) as never;
    const adapter = createRedditAdapter({ fetchJson });
    await adapter.fetch({ terms: [], watch: [{ term: "hard water", category: "c", geo: "US" }], subreddits: [{ name: "HaircareScience", category: "c" }], geo: "US", windowDays: 7 });
    expect(urls.map((u) => u.replace(/^https:\/\/[^/]+/, ""))).toEqual([
      `/search.json?q=${encodeURIComponent('"hard water"')}&sort=relevance&t=month&limit=12&raw_json=1`,
      "/r/HaircareScience/top.json?t=week&limit=100&raw_json=1",
    ]);
    urls.length = 0;
    await adapter.fetch({ terms: [], watch: [], subreddits: [], geo: "US", windowDays: 7 });
    expect(urls).toEqual([]);
    await adapter.fetch({ terms: [], watch: [], geo: "US", windowDays: 7 });
    expect(urls.length).toBeGreaterThan(5);
  });
});
