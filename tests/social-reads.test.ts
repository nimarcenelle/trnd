import { afterEach, describe, expect, it, vi } from "vitest";

import type { SocialPost } from "../lib/db/types";
import { env } from "../lib/env";
import { runActorSync } from "../lib/social/apify";
import { toFacebookPosts, type ApifyFacebookItem } from "../lib/social/facebook";
import { normalizeHandle } from "../lib/social/index";
import { fetchInstagramPosts, toInstagramPosts, type ApifyInstagramItem } from "../lib/social/instagram";
import {
  classifyPost,
  engagementOf,
  postsOnTerm,
  readAccount,
  rivalMoves,
  type AccountPost,
} from "../lib/social/read";
import { toTiktokPosts, type ApifyTikTokProfileItem } from "../lib/social/tiktok";

const now = new Date("2026-09-12T12:00:00Z");
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();

const OWNER_BANNED = /[—–→×]/;

describe("toInstagramPosts", () => {
  const items: ApifyInstagramItem[] = [
    {
      username: "bellwoodcoffee",
      latestPosts: [
        {
          id: 123 as unknown as string,
          shortCode: "abc",
          url: "https://www.instagram.com/p/abc/",
          caption: "x".repeat(500),
          type: "Video",
          timestamp: "2026-09-10T15:00:00.000Z",
          likesCount: 40,
          commentsCount: 5,
          videoPlayCount: 900,
          isSponsored: true,
        },
        { shortCode: "def", type: "Sidecar" },
        { id: "9", type: "Image", videoViewCount: 50, timestamp: "not a date" },
        { type: "Image", caption: "no id, cannot dedupe" },
      ],
    },
    { username: "empty" },
  ];
  const posts = toInstagramPosts(items);

  it("maps a full post, stringifying the id and capping the caption", () => {
    expect(posts).toHaveLength(3);
    const p = posts[0];
    expect(p.platform).toBe("instagram");
    expect(p.external_id).toBe("123");
    expect(p.caption).toHaveLength(400);
    expect(p.media_type).toBe("video");
    expect(p.posted_at).toBe("2026-09-10T15:00:00.000Z");
    expect(p).toMatchObject({ likes: 40, comments: 5, shares: 0, views: 900, is_ad: true });
  });

  it("defaults missing fields and falls back to shortCode and videoViewCount", () => {
    expect(posts[1]).toMatchObject({
      external_id: "def",
      url: "https://www.instagram.com/p/def/",
      caption: "",
      media_type: "carousel",
      posted_at: null,
      likes: 0,
      comments: 0,
      views: 0,
      is_ad: false,
      kind: "other",
    });
    expect(posts[2]).toMatchObject({ external_id: "9", media_type: "image", views: 50, posted_at: null });
  });
});

describe("toTiktokPosts", () => {
  const items: ApifyTikTokProfileItem[] = [
    {
      id: "7001",
      text: "New cortado just dropped",
      createTimeISO: "2026-09-11T10:00:00Z",
      playCount: 5000,
      diggCount: 300,
      commentCount: 12,
      shareCount: 7,
      webVideoUrl: "https://www.tiktok.com/@bellwood/video/7001",
      authorMeta: { name: "bellwood" },
    },
    { id: "7002", authorMeta: { name: "bellwood" }, isAd: true },
    { text: "no id" },
  ];
  const posts = toTiktokPosts(items);

  it("maps a full video", () => {
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      platform: "tiktok",
      external_id: "7001",
      url: "https://www.tiktok.com/@bellwood/video/7001",
      media_type: "video",
      posted_at: "2026-09-11T10:00:00.000Z",
      likes: 300,
      comments: 12,
      shares: 7,
      views: 5000,
      is_ad: false,
      kind: "new_item",
    });
  });

  it("defaults missing fields and builds the url from the author", () => {
    expect(posts[1]).toMatchObject({
      external_id: "7002",
      url: "https://www.tiktok.com/@bellwood/video/7002",
      caption: "",
      posted_at: null,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      is_ad: true,
    });
  });
});

describe("toFacebookPosts", () => {
  const items: ApifyFacebookItem[] = [
    {
      postId: 111,
      url: "https://www.facebook.com/bellwood/posts/111",
      text: "Trivia tonight at 7",
      time: "2026-09-09T23:00:00Z",
      likes: 20,
      comments: 3,
      shares: 1,
      media: [{ __typename: "Photo" }],
    },
    {
      id: "222",
      postUrl: "https://www.facebook.com/bellwood/posts/222",
      message: "Thank you to our regulars",
      timestamp: 1788998400,
      reactionsCount: 9,
      commentsCount: 2,
      sharesCount: 4,
      media: [{ type: "Video" }],
      isSponsored: true,
    },
    { id: "333", media: [{}, {}] },
    { id: "444", timestamp: "2026-09-01T00:00:00Z" },
    { text: "no id" },
  ];
  const posts = toFacebookPosts(items);

  it("maps current-schema fields", () => {
    expect(posts).toHaveLength(4);
    expect(posts[0]).toMatchObject({
      platform: "facebook",
      external_id: "111",
      media_type: "image",
      posted_at: "2026-09-09T23:00:00.000Z",
      likes: 20,
      comments: 3,
      shares: 1,
      views: 0,
      is_ad: false,
      kind: "event",
    });
  });

  it("reads alternate field names and unix-second timestamps", () => {
    expect(posts[1]).toMatchObject({
      url: "https://www.facebook.com/bellwood/posts/222",
      caption: "Thank you to our regulars",
      media_type: "video",
      posted_at: new Date(1788998400 * 1000).toISOString(),
      likes: 9,
      comments: 2,
      shares: 4,
      is_ad: true,
      kind: "proof",
    });
  });

  it("degrades missing fields to defaults", () => {
    expect(posts[2]).toMatchObject({ url: "", caption: "", media_type: "carousel", posted_at: null, likes: 0 });
    expect(posts[3]).toMatchObject({ media_type: "text", posted_at: "2026-09-01T00:00:00.000Z" });
  });
});

describe("fetch paths", () => {
  const token = env.apifyToken;
  afterEach(() => {
    env.apifyToken = token;
    vi.restoreAllMocks();
  });

  it("returns [] without a key and never calls out", async () => {
    env.apifyToken = "";
    const fetchText = vi.fn();
    expect(await fetchInstagramPosts("bellwood", { fetchText })).toEqual([]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("posts the profile input to the run-sync endpoint and maps the result", async () => {
    env.apifyToken = "tok";
    const fetchText = vi.fn(async () =>
      JSON.stringify([{ latestPosts: [{ id: "1", caption: "hi", likesCount: 3 }] }]),
    );
    const posts = await fetchInstagramPosts("bellwood", { fetchText });
    const [url, init] = fetchText.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toBe(
      "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=tok",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ usernames: ["bellwood"] });
    expect(posts.map((p) => p.likes)).toEqual([3]);
  });

  it("warns and returns [] when the actor fails", async () => {
    env.apifyToken = "tok";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchText = vi.fn(async () => {
      throw new Error("HTTP 402");
    });
    expect(await fetchInstagramPosts("bellwood", { fetchText })).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("treats a non-array or non-JSON body as no items", async () => {
    env.apifyToken = "tok";
    expect(await runActorSync("a/b", {}, { fetchText: async () => '{"error":"x"}' })).toEqual([]);
    expect(await runActorSync("a/b", {}, { fetchText: async () => "<html>" })).toEqual([]);
  });
});

describe("classifyPost", () => {
  it.each([
    ["Half-price espresso martinis Thursdays", "promo"],
    ["20% off all pastries", "promo"],
    ["$5 lattes until noon", "promo"],
    ["New fall menu, 20% off this weekend", "promo"],
    ["Live music tonight from 8", "event"],
    ["Trivia this Thursday, bring a team of four", "event"],
    ["Introducing our pumpkin cold brew", "new_item"],
    ["Back on the menu: the maple cortado", "new_item"],
    ['"Best cortado in the city, hands down" says Dana', "proof"],
    ["Thank you for 500 five-star reviews", "proof"],
    ["Roasting day at the shop", "behind_scenes"],
    ["Meet Sam, our head baker", "behind_scenes"],
    ["Good morning", "other"],
    ["", "other"],
  ])("%s -> %s", (caption, kind) => {
    expect(classifyPost(caption)).toBe(kind);
  });
});

describe("readAccount", () => {
  const p = (daysAgo: number | null, o: Partial<AccountPost> = {}): AccountPost => ({
    caption: "",
    media_type: "image",
    posted_at: daysAgo === null ? null : at(daysAgo),
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    kind: null,
    ...o,
  });
  const breakout = p(1, {
    caption: "Half-price espresso martinis Thursdays",
    media_type: "video",
    likes: 100,
    comments: 10,
    views: 2000,
  });
  const posts = [
    breakout,
    p(3, { likes: 20, kind: "event" }),
    p(10, { likes: 30, media_type: "video", views: 600 }),
    p(15, { likes: 40 }),
    p(20, { likes: 45, shares: 5 }),
    p(27, { likes: 25 }),
    p(30, { likes: 999 }),
    p(40),
    p(60, { likes: 999 }),
    p(-1, { likes: 999 }),
    p(null, { likes: 999 }),
  ];
  const read = readAccount(posts, now);

  it("computes 28-day cadence against the 28 to 56 day window", () => {
    expect(read.posts).toBe(6);
    expect(read.postsPerWeek).toBe(1.5);
    expect(read.prevPostsPerWeek).toBe(0.5);
  });

  it("takes the median engagement, rate, video share and kind mix", () => {
    // [20, 25, 30, 40, 50, 110]
    expect(read.engagementMedian).toBe(35);
    expect(read.engagementRate).toBe(0.0525);
    expect(read.videoShare).toBeCloseTo(2 / 6);
    expect(read.byKind).toEqual({ promo: 1, event: 1, new_item: 0, proof: 0, behind_scenes: 0, other: 4 });
  });

  it("names the top post, the breakout and the silence", () => {
    expect(read.top).toBe(breakout);
    expect(read.breakout).toBe(breakout);
    expect(read.lastPostedAt).toBe(at(1));
    expect(read.silentDays).toBe(1);
  });

  it("picks the recent post furthest above the median, and none when nothing clears it", () => {
    const a = p(2, { likes: 90 });
    const b = p(4, { likes: 150 });
    const mixed = readAccount([a, b, p(10, { likes: 30 }), p(12, { likes: 30 }), p(14, { likes: 30 })], now);
    expect(mixed.breakout).toBe(b);
    const flat = readAccount([p(1, { likes: 30 }), p(9, { likes: 30 }), p(12, { likes: 30 })], now);
    expect(flat.breakout).toBeNull();
    // Old big posts are not breakouts.
    const old = readAccount([p(20, { likes: 500 }), p(21, { likes: 10 }), p(22, { likes: 10 })], now);
    expect(old.breakout).toBeNull();
  });

  it("returns an empty read for no posts", () => {
    const empty = readAccount([], now);
    expect(empty).toMatchObject({
      posts: 0,
      postsPerWeek: 0,
      engagementMedian: 0,
      engagementRate: null,
      videoShare: 0,
      top: null,
      breakout: null,
      lastPostedAt: null,
      silentDays: null,
    });
  });
});

describe("postsOnTerm", () => {
  const posts = [
    "Espresso martinis are back Thursday",
    "Our espresso is from Burundi",
    "Iced latte weather",
    "Iced tea on tap",
    "Pumpkin latte is here",
    "Pumpkin spice latte season",
  ].map((caption) => ({ caption }));
  const on = (term: string) => postsOnTerm(posts, term).map((p) => p.caption);

  it("matches every word of a short term, plural-blind", () => {
    expect(on("espresso martini")).toEqual(["Espresso martinis are back Thursday"]);
    expect(on("iced latte")).toEqual(["Iced latte weather"]);
  });

  it("lets a longer term miss one word", () => {
    expect(on("pumpkin spice latte")).toEqual(["Pumpkin latte is here", "Pumpkin spice latte season"]);
  });

  it("returns nothing for terms no post mentions or that are only filler", () => {
    expect(on("matcha")).toEqual([]);
    expect(on("the best")).toEqual([]);
  });
});

describe("rivalMoves", () => {
  let n = 0;
  const post = (o: Partial<SocialPost>): SocialPost => ({
    id: `p${++n}`,
    business_id: "b1",
    competitor_id: null,
    platform: "instagram",
    external_id: `x${n}`,
    url: `https://example.com/${n}`,
    caption: "",
    media_type: "image",
    posted_at: null,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    is_ad: false,
    kind: null,
    captured_at: now.toISOString(),
    ...o,
  });

  const history = (competitor_id: string, platform: SocialPost["platform"], days: number[], likes: number) =>
    days.map((d) => post({ competitor_id, platform, posted_at: at(d), likes, caption: "Good morning" }));

  const aPromo = post({
    competitor_id: "rA",
    posted_at: at(2),
    likes: 214,
    caption: "Half-price espresso martinis Thursdays. Come early! #bellwood @friends",
  });
  const aOld = post({ competitor_id: "rA", posted_at: at(9), likes: 500, caption: "Our roasting team" });
  const bOffer = post({
    competitor_id: "rB",
    platform: "facebook",
    posted_at: at(1),
    likes: 30,
    caption: "Thursday is back!\nEspresso martinis $6 all night — bring a friend",
  });
  const cVideo = post({
    competitor_id: "rC",
    platform: "tiktok",
    media_type: "video",
    posted_at: at(3),
    views: 1200,
    caption: "Behind the scenes → roasting 20kg × 2 today",
  });
  const posts = [
    ...history("rA", "instagram", [10, 12, 14, 16], 70),
    aOld,
    aPromo,
    ...history("rB", "facebook", [20, 25], 10),
    bOffer,
    cVideo,
  ];

  it("writes one plain owner-readable line per move", () => {
    const moves = rivalMoves(posts, now);
    expect(moves.map((m) => m.line)).toEqual([
      'Posted a promo: "Half-price espresso martinis Thursdays" (214 likes, 3x their usual)',
      'Posted a promo: "Espresso martinis $6 all night" (30 likes, 3x their usual)',
      'Showed behind the scenes: "Behind the scenes to roasting 20kg x 2 today" (1.2k views)',
    ]);
    for (const m of moves) expect(m.line).not.toMatch(OWNER_BANNED);
    expect(moves[0]).toMatchObject({
      competitorId: "rA",
      platform: "instagram",
      url: aPromo.url,
      when: "2026-09-10",
      kind: "promo",
      engagement: 214,
      aboveMedian: true,
    });
    expect(moves[2]).toMatchObject({ competitorId: "rC", kind: "behind_scenes", engagement: 0, aboveMedian: false });
  });

  it("appends the offer when the quoted clause does not carry it", () => {
    const long = post({
      competitor_id: "rD",
      posted_at: at(1),
      likes: 5,
      caption: `Our brand new seasonal autumn breakfast sandwich with maple bacon and aged cheddar on brioche for only $9`,
    });
    const [move] = rivalMoves([long], now);
    expect(move.line).toMatch(/…", \$9 \(5 likes\)$/);
    expect(move.line).toMatch(/^Posted a promo: "/);
  });

  it("sorts by engagement, keeps to the day window and honours the cap", () => {
    expect(rivalMoves(posts, now).map((m) => m.engagement)).toEqual([214, 30, 0]);
    expect(rivalMoves(posts, now, { days: 10 }).map((m) => m.engagement)).toEqual([500, 214, 70, 30, 0]);
    expect(rivalMoves(posts, now, { max: 2 })).toHaveLength(2);
    expect(rivalMoves(posts, now, { days: 0.5 })).toEqual([]);
  });

  it("breaks engagement ties newest first", () => {
    const older = post({ competitor_id: "rE", posted_at: at(4), likes: 10 });
    const newer = post({ competitor_id: "rE", posted_at: at(1), likes: 10 });
    expect(rivalMoves([older, newer], now).map((m) => m.url)).toEqual([newer.url, older.url]);
  });
});

describe("engagementOf", () => {
  it("sums likes, comments and shares", () => {
    expect(engagementOf({ likes: 3, comments: 2, shares: 1 })).toBe(6);
  });
});

describe("normalizeHandle", () => {
  it.each([
    ["instagram", "https://www.instagram.com/BellwoodCoffee/?hl=en", "bellwoodcoffee"],
    ["instagram", "instagram.com/bellwoodcoffee/", "bellwoodcoffee"],
    ["instagram", "@BellwoodCoffee", "bellwoodcoffee"],
    ["instagram", "bellwoodcoffee/", "bellwoodcoffee"],
    ["instagram", "  ", ""],
    ["tiktok", "https://www.tiktok.com/@bellwood.coffee/video/123", "bellwood.coffee"],
    ["tiktok", "@bellwood.coffee/", "bellwood.coffee"],
    ["facebook", "https://m.facebook.com/BellwoodCoffee/posts/123", "bellwoodcoffee"],
    ["facebook", "facebook.com/pages/Bellwood-Coffee/1234/", "pages/bellwood-coffee/1234"],
    ["facebook", "https://www.facebook.com/profile.php?id=1000123", "profile.php?id=1000123"],
  ] as const)("%s %s -> %s", (platform, raw, want) => {
    expect(normalizeHandle(platform, raw)).toBe(want);
  });
});
