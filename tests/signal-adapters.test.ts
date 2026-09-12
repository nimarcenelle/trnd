import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseTrendsRss } from "../lib/signals/adapters/google-trends-rss";
import { parseNewsRss } from "../lib/signals/adapters/google-news";
import { topRedditSignals, type RedditListing } from "../lib/signals/adapters/reddit";
import {
  deltaFromSeries,
  extractTimelinePoints,
  parseGoogleJson,
} from "../lib/signals/adapters/trends-iot";
import { classifyTerm } from "../lib/signals/category-terms";
import { normalizeTerm } from "../lib/signals/normalize";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("google trends RSS parser", () => {
  it("extracts terms and approx traffic", () => {
    const entries = parseTrendsRss(fixture("trends-rss.xml"));
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ term: "matcha latte recipe", traffic: 200000 });
  });
});

describe("category lexicon classifier", () => {
  it("classifies business-relevant terms and drops noise", () => {
    expect(classifyTerm("matcha latte recipe")).toBe("Restaurants & cafés");
    expect(classifyTerm("teeth whitening at home")).toBe("Dental & wellness");
    expect(classifyTerm("celebrity gossip thing")).toBeNull();
  });
});

describe("reddit ranker", () => {
  it("ranks by upvote velocity and keeps top N", () => {
    const listing = JSON.parse(fixture("reddit-top.json")) as RedditListing;
    const signals = topRedditSignals(listing, "Health & beauty", "US", 3);
    expect(signals).toHaveLength(3);
    expect(signals[0].term).toContain("skin barrier");
    expect(signals.every((s) => s.source === "reddit")).toBe(true);
    expect(signals.every((s) => (s.delta_pct ?? 0) <= 100)).toBe(true);
  });
});

describe("news RSS parser", () => {
  it("parses item pubDates for recency windowing", () => {
    const items = parseNewsRss(fixture("news-rss.xml"));
    expect(items).toHaveLength(3);
    expect(items[0].title).toContain("facial balancing");
  });
});

describe("trends interest-over-time helpers", () => {
  it("strips Google's junk prefix", () => {
    const parsed = parseGoogleJson<{ ok: boolean }>(")]}'\n{\"ok\":true}");
    expect(parsed.ok).toBe(true);
  });
  it("extracts timeline points and computes week-over-week delta", () => {
    const timeline = {
      default: {
        timelineData: Array.from({ length: 14 }, (_, i) => ({
          time: String(1700000000 + i * 86400),
          value: [i < 7 ? 50 : 75],
        })),
      },
    };
    const points = extractTimelinePoints(timeline, "matcha", "US");
    expect(points).toHaveLength(14);
    expect(deltaFromSeries(points)).toBe(50);
  });
});

describe("normalizeTerm", () => {
  it("lowercases, strips punctuation, snake_cases", () => {
    expect(normalizeTerm("  Iced-Latte  Alternatives! ")).toBe("icedlatte_alternatives");
  });
});

import {
  ccSeries,
  ccSignals,
  collapseVariants,
  curveDelta,
  INDUSTRY_TO_CATEGORY,
  isCategoryBearing,
} from "../lib/signals/adapters/tiktok-cc";

// Trimmed from a live GetHashtagList capture (Aug 2026).
const CC_FIXTURE = {
  BaseResp: { StatusCode: 0, StatusMessage: "" },
  items: [
    {
      hashtagName: "babylist",
      industryIDs: ["12000000000"],
      publishCnt: "12677",
      vv: "21831042",
      rankIndex: "2",
      popularityCurve: [
        { timestamp: "1786924800", value: 5 },
        { timestamp: "1787011200", value: 72 },
        { timestamp: "1787097600", value: 97 },
        { timestamp: "1787184000", value: 100 },
        { timestamp: "1787270400", value: 81 },
        { timestamp: "1787356800", value: 34 },
        { timestamp: "1787443200", value: 0 },
      ],
    },
  ],
};

describe("tiktok creative center adapter", () => {
  it("maps hashtags to signals with the queried category", () => {
    const [sig] = ccSignals(CC_FIXTURE, "Health & beauty", "US", 7);
    expect(sig.source).toBe("tiktok");
    expect(sig.term).toBe("babylist");
    expect(sig.category).toBe("Health & beauty");
    expect(sig.metric_type).toBe("conversation");
    expect(sig.value).toBe(12677);
    expect(sig.window_days).toBe(7);
  });

  it("reads the tail of the curve against the stretch before it", () => {
    // Six real points once today's partial 0 is dropped: (100+81+34)/3
    // against (5+72+97)/3 is +24%, where the old reading called it +100%.
    expect(curveDelta(CC_FIXTURE.items[0].popularityCurve)).toBe(24);
    // A flat-then-loud curve has no honest baseline to divide by.
    expect(curveDelta([
      { timestamp: "1", value: 0 },
      { timestamp: "2", value: 0 },
      { timestamp: "3", value: 60 },
      { timestamp: "4", value: 80 },
    ])).toBeNull();
    // Falling off is still a read.
    expect(curveDelta([
      { timestamp: "1", value: 80 },
      { timestamp: "2", value: 80 },
      { timestamp: "3", value: 40 },
      { timestamp: "4", value: 40 },
    ])).toBe(-50);
    expect(curveDelta([])).toBeNull();
  });

  it("emits daily series points from the curve", () => {
    const series = ccSeries(CC_FIXTURE, "US");
    expect(series.length).toBe(7);
    expect(series[0]).toMatchObject({ term: "babylist", geo: "US", value: 5 });
    expect(series[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("covers all seven TRND categories in the industry map", () => {
    expect(new Set(Object.values(INDUSTRY_TO_CATEGORY)).size).toBe(7);
  });

  it("returns nothing on an API error payload", () => {
    expect(ccSignals({ BaseResp: { StatusCode: 40101 } }, "x", "US", 7)).toEqual([]);
  });
});

describe("tiktok board noise", () => {
  // The real Food & Beverage board, 2026-09-11: three spellings of one
  // holiday, none of them about food.
  const labor = [{ term: "happy labor day" }, { term: "ldw" }, { term: "labor day 2026" }];

  it("collapses spellings of one trend to the row TikTok ranked highest", () => {
    expect(collapseVariants(labor).map((r) => r.term)).toEqual(["happy labor day", "ldw"]);
  });

  it("keeps genuinely different trends apart", () => {
    const rows = [{ term: "matcha latte" }, { term: "cold plunge" }, { term: "glass skin" }];
    expect(collapseVariants(rows)).toHaveLength(3);
  });

  it("only demotes a row the lexicon can place in a DIFFERENT category", () => {
    // A live board read showed the naive "matches any category" test marking
    // apparel terms on the Home Improvement board as on-topic. The fallback
    // answers for the filed category or not at all.
    expect(isCategoryBearing("matcha latte", "Restaurants & cafés")).toBe(true);
    expect(isCategoryBearing("first day outfits", "Home services")).toBe(false);
    // Unplaceable terms stay on-topic: a missed demotion costs a sentence of
    // framing, a wrong one buries a real trend.
    expect(isCategoryBearing("leaf blower maintenance", "Home services")).toBe(true);
    expect(isCategoryBearing("happy labor day", "Restaurants & cafés")).toBe(true);
  });

  it("prefers the model's per-board verdict over the lexicon when one is given", () => {
    const payload = {
      BaseResp: { StatusCode: 0 },
      items: [{ hashtagName: "happylaborday", publishCnt: "9031", popularityCurve: [] }],
    };
    const [sig] = ccSignals(
      payload,
      "Restaurants & cafés",
      "US",
      7,
      () => "happy labor day",
      () => false,
    );
    expect((sig.raw as { categoryBearing: boolean }).categoryBearing).toBe(false);
  });
});

describe("tiktok hashtag humanization", () => {
  it("swaps slugs for readable terms in signals and series, keeping the raw tag", () => {
    const termFor = (h: string) => (h === "babylist" ? "baby registries" : h);
    const [sig] = ccSignals(CC_FIXTURE, "Health & beauty", "US", 7, termFor);
    expect(sig.term).toBe("baby registries");
    expect((sig.raw as { hashtagName?: string }).hashtagName).toBe("babylist");
    const series = ccSeries(CC_FIXTURE, "US", termFor);
    expect(series[0].term).toBe("baby_registries"); // normalized for series keys
  });

  it("adapter translates via the injected humanizer consistently", async () => {
    const { createTiktokCcAdapter } = await import("../lib/signals/adapters/tiktok-cc");
    const adapter = createTiktokCcAdapter({
      humanize: async (items) => items.map((i) => ({ term: `nice ${i.hashtag}`, onTopic: true })),
      fetchJson: async <T,>() => CC_FIXTURE as T,
    });
    const input = { terms: [], watch: [], geo: "US", windowDays: 7 };
    const signals = await adapter.fetch(input);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.term === "nice babylist")).toBe(true);
    const series = (await adapter.fetchSeries?.(input)) ?? [];
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((p) => p.term === "nice_babylist")).toBe(true);
  });
});

import {
  parseIsoDuration,
  readShorts,
  shortsSeries,
  velocity,
  type ShortVideo,
} from "../lib/signals/adapters/youtube";

describe("youtube shorts read", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const short = (v: Partial<ShortVideo> & Pick<ShortVideo, "id" | "publishedAt" | "views">): ShortVideo => ({
    title: "",
    description: "",
    channel: "",
    channelId: "",
    likes: 0,
    comments: 0,
    durationSec: 30,
    ...v,
  });
  const shorts: ShortVideo[] = [
    short({ id: "a", publishedAt: at(1), title: "color analysis in 60s", channel: "Studio A", views: 90_000, likes: 6_000, comments: 900, durationSec: 45 }),
    short({ id: "b", publishedAt: at(3), title: "undertone test", channel: "Studio B", views: 30_000, likes: 1_000, comments: 100, durationSec: 21 }),
    short({ id: "c", publishedAt: at(9), title: "old one", channel: "Studio C", views: 40_000 }),
    short({ id: "d", publishedAt: at(12), title: "older", channel: "Studio D", views: 20_000 }),
    short({ id: "e", publishedAt: at(40), title: "outside the window", channel: "Studio E", views: 999_000 }),
  ];

  it("splits the window into this week and a three-week baseline, and names the top short", () => {
    const read = readShorts(shorts, now);
    expect(read.uploads).toBe(2);
    // Two videos across three baseline weeks is a weekly average of one —
    // the point of the wider baseline is that it is not one noisy week.
    expect(read.uploadsPrev).toBe(1);
    expect(read.views).toBe(120_000);
    expect(read.viewsPrev).toBe(20_000);
    expect(read.top?.id).toBe("a");
  });

  it("drops the video that is outside the lookback entirely", () => {
    const read = readShorts(shorts, now);
    expect(read.corpus.some((c) => c.id === "e")).toBe(false);
    // The 999k video sits 40 days back: it must not reach either window.
    expect(read.views).toBe(120_000);
    expect(read.viewsPrev).toBe(20_000);
  });

  it("measures momentum on velocity, so an older baseline cannot fake a decline", () => {
    // Same views, but the baseline videos have had far longer to collect
    // them: on raw totals this reads as a collapse, on views-per-hour it is
    // the rise it actually is.
    const flat = [
      short({ id: "new", publishedAt: at(1), views: 24_000 }),
      short({ id: "old", publishedAt: at(20), views: 24_000 }),
    ];
    const read = readShorts(flat, now);
    expect(read.views).toBe(24_000);
    expect(read.deltaPct).not.toBeNull();
    expect(read.deltaPct!).toBeGreaterThan(0);
  });

  it("reports no delta rather than a spike when there is no baseline", () => {
    const read = readShorts(shorts.slice(0, 2), now);
    expect(read.views).toBe(120_000);
    expect(read.deltaPct).toBeNull();
  });

  it("reads the format: engagement, median length, and the fastest climber", () => {
    const read = readShorts(shorts, now);
    // (6000+900+1000+100) / 120000 = 6.67%
    expect(read.engagementPct).toBeCloseTo(6.67, 1);
    expect(read.medianDurationSec).toBe(33);
    // 90k in a day outruns 30k in three, so the top video is also the
    // fastest climber here; they diverge when a big channel's floor beats a
    // small channel's spike on totals alone.
    expect(read.breakout?.id).toBe("a");
    expect(read.corpus[0].velocity).toBeGreaterThan(0);
    expect(read.corpus).toHaveLength(2);
  });

  it("excludes long-form that the API's <4min bucket let through", () => {
    const withLong = [...shorts, short({ id: "long", publishedAt: at(2), views: 500_000, durationSec: 220 })];
    const read = readShorts(withLong, now);
    expect(read.uploads).toBe(2);
    expect(read.corpus.some((c) => c.id === "long")).toBe(false);
  });

  it("names channels working the format more than once", () => {
    const repeat = [
      short({ id: "r1", publishedAt: at(1), channel: "Studio A", views: 10_000 }),
      short({ id: "r2", publishedAt: at(2), channel: "Studio A", views: 12_000 }),
      short({ id: "r3", publishedAt: at(3), channel: "Studio B", views: 9_000 }),
    ];
    expect(readShorts(repeat, now).repeatChannels).toEqual(["Studio A"]);
  });

  it("draws a daily view line for the tracker", () => {
    const series = shortsSeries(shorts, "color analysis", "US-GA");
    expect(series).toHaveLength(5);
    expect(series[0].day < series[series.length - 1].day).toBe(true);
    expect(series.every((p) => p.term === "color analysis" && p.geo === "US-GA")).toBe(true);
  });
});

describe("youtube duration and velocity", () => {
  it("parses ISO 8601 durations, including the fields Shorts rarely use", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1M30S")).toBe(90);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration(undefined)).toBe(0);
    expect(parseIsoDuration("garbage")).toBe(0);
  });

  it("floors age at an hour so a minutes-old video cannot divide its way to a breakout", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    const fresh = {
      id: "x", publishedAt: new Date(now.getTime() - 60_000).toISOString(), title: "", description: "",
      channel: "", channelId: "", views: 1_000, likes: 0, comments: 0, durationSec: 20,
    };
    expect(velocity(fresh, now)).toBe(1_000);
  });
});

import {
  readTikTok,
  toPosts,
  type ApifyTikTokItem,
  type TikTokPost,
} from "../lib/signals/adapters/tiktok-apify";

describe("tiktok per-term read (apify)", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const post = (p: Partial<TikTokPost> & Pick<TikTokPost, "id" | "publishedAt" | "views">): TikTokPost => ({
    url: `https://www.tiktok.com/@x/video/${p.id}`,
    caption: "",
    author: "",
    authorFollowers: 500,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSec: 25,
    hashtags: [],
    ...p,
  });

  it("maps the actor's payload and tolerates the fields it renames away", () => {
    const items: ApifyTikTokItem[] = [
      {
        id: "1",
        text: "cold plunge at 39 degrees",
        createTimeISO: at(2),
        playCount: 80_000,
        diggCount: 6_000,
        commentCount: 300,
        shareCount: 900,
        collectCount: 1_200,
        webVideoUrl: "https://www.tiktok.com/@studio/video/1",
        videoMeta: { duration: 22 },
        authorMeta: { nickName: "Plunge Studio", fans: 4_000 },
        hashtags: [{ name: "coldplunge" }, { name: "recovery" }],
      },
      // Everything missing but a timestamp: must survive as zeros.
      { createTimeISO: at(3) },
      // No usable timestamp at all: must be dropped, not dated to 1970.
      { id: "3", playCount: 999 },
    ];
    const posts = toPosts(items);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ views: 80_000, shares: 900, saves: 1_200, durationSec: 22 });
    expect(posts[0].hashtags).toEqual(["coldplunge", "recovery"]);
    expect(posts[1].views).toBe(0);
  });

  it("reports shares and saves as their own rate, not folded into engagement", () => {
    const read = readTikTok(
      [post({ id: "a", publishedAt: at(1), views: 100_000, likes: 5_000, comments: 1_000, shares: 2_000, saves: 3_000 })],
      now,
    );
    expect(read.engagementPct).toBeCloseTo(6, 1);
    expect(read.actionPct).toBeCloseTo(5, 1);
  });

  it("keeps only hashtags more than one winning post carries", () => {
    const read = readTikTok(
      [
        post({ id: "a", publishedAt: at(1), views: 10, hashtags: ["coldplunge", "nyc"] }),
        post({ id: "b", publishedAt: at(2), views: 10, hashtags: ["coldplunge", "sauna"] }),
      ],
      now,
    );
    expect(read.hashtags).toEqual(["coldplunge"]);
  });

  it("flags the posts that carried without an audience behind them", () => {
    const read = readTikTok(
      [
        post({ id: "small", publishedAt: at(1), views: 50_000, authorFollowers: 800 }),
        post({ id: "big", publishedAt: at(1), views: 50_000, authorFollowers: 2_000_000 }),
      ],
      now,
    );
    expect(read.corpus.find((c) => c.id === "small")?.fromSmallAccount).toBe(true);
    expect(read.corpus.find((c) => c.id === "big")?.fromSmallAccount).toBe(false);
  });

  it("measures momentum on velocity, like the Shorts read", () => {
    const read = readTikTok(
      [post({ id: "new", publishedAt: at(1), views: 24_000 }), post({ id: "old", publishedAt: at(20), views: 24_000 })],
      now,
    );
    expect(read.deltaPct).not.toBeNull();
    expect(read.deltaPct!).toBeGreaterThan(0);
  });

  it("drops long-form and anything outside the window", () => {
    const read = readTikTok(
      [
        post({ id: "ok", publishedAt: at(1), views: 1_000 }),
        post({ id: "long", publishedAt: at(1), views: 900_000, durationSec: 400 }),
        post({ id: "ancient", publishedAt: at(90), views: 900_000 }),
      ],
      now,
    );
    expect(read.uploads).toBe(1);
    expect(read.views).toBe(1_000);
  });
});

describe("meta instagram scopes", () => {
  it("does not request unapproved Reels scopes in the live ad-connect flow", async () => {
    const { META_SCOPES } = await import("../lib/ads/meta");
    // Until App Review passes, asking for instagram_basic degrades the
    // consent screen for the connect that already works.
    expect(process.env.META_INSTAGRAM_SCOPES).not.toBe("1");
    expect(META_SCOPES).not.toContain("instagram_basic");
    expect(META_SCOPES).toContain("ads_read");
  });
});

describe("youtube term prioritisation", () => {
  it("caps to a business's own terms before the stock category ones", async () => {
    const { createYoutubeAdapter } = await import("../lib/signals/adapters/youtube");
    process.env.YOUTUBE_API_KEY = "test-key";
    const asked: string[] = [];
    const adapter = createYoutubeAdapter({
      termCap: 2,
      fetchJson: async <T,>(url: string) => {
        const q = new URL(url).searchParams.get("q");
        if (q) asked.push(q);
        return { items: [] } as T;
      },
    });
    // The ingest watchlist order: stock terms first, business terms after.
    await adapter.fetch({
      terms: [],
      watch: [
        { term: "stock one", category: "Health & beauty" },
        { term: "stock two", category: "Health & beauty" },
        { term: "business term", category: "Health & beauty", geo: "US-NY" },
      ],
      geo: "US",
      windowDays: 7,
    });
    delete process.env.YOUTUBE_API_KEY;
    expect(asked).toContain("business term");
    expect(asked).not.toContain("stock two");
  });
});

describe("youtube recommendation quality gate", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const at = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
  const v = (o: Partial<ShortVideo> & Pick<ShortVideo, "id" | "views" | "likes">): ShortVideo => ({
    publishedAt: at(1), title: o.id, description: "", channel: o.id, channelId: o.id,
    comments: 0, durationSec: 25, ...o,
  });

  it("does not tell the owner to watch a video nobody reacted to", () => {
    const read = readShorts(
      [
        // The algorithm-pushed monster: most views, almost no reaction.
        v({ id: "pushed", views: 2_000_000, likes: 3_800 }),
        v({ id: "earned", views: 90_000, likes: 7_000 }),
        v({ id: "mid1", views: 40_000, likes: 2_000 }),
        v({ id: "mid2", views: 30_000, likes: 1_500 }),
      ],
      now,
    );
    expect(read.top?.id).toBe("earned");
    // The pushed video still counts toward the week's volume.
    expect(read.views).toBe(2_160_000);
  });

  it("falls back to the full set when the sample is too small for a median", () => {
    const read = readShorts([v({ id: "only", views: 500_000, likes: 10 })], now);
    expect(read.top?.id).toBe("only");
  });
});
