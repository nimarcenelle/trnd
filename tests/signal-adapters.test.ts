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

import { ccSeries, ccSignals, curveDelta, INDUSTRY_TO_CATEGORY } from "../lib/signals/adapters/tiktok-cc";

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
      humanize: async (tags) => tags.map((t) => `nice ${t}`),
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

import { readShorts, shortsSeries, type ShortVideo } from "../lib/signals/adapters/youtube";

describe("youtube shorts read", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const shorts: ShortVideo[] = [
    { id: "a", publishedAt: at(1), title: "color analysis in 60s", channel: "Studio A", views: 90_000 },
    { id: "b", publishedAt: at(3), title: "undertone test", channel: "Studio B", views: 30_000 },
    { id: "c", publishedAt: at(9), title: "old one", channel: "Studio C", views: 40_000 },
    { id: "d", publishedAt: at(12), title: "older", channel: "Studio D", views: 20_000 },
    { id: "e", publishedAt: at(30), title: "outside the window", channel: "Studio E", views: 999_000 },
  ];

  it("splits the fortnight into this week and last, and names the top short", () => {
    const read = readShorts(shorts, now);
    expect(read.uploads).toBe(2);
    expect(read.uploadsPrev).toBe(2);
    expect(read.views).toBe(120_000);
    expect(read.viewsPrev).toBe(60_000);
    expect(read.deltaPct).toBe(100);
    expect(read.top?.id).toBe("a");
  });

  it("reports no delta rather than a spike when last week was empty", () => {
    const read = readShorts(shorts.slice(0, 2), now);
    expect(read.views).toBe(120_000);
    expect(read.deltaPct).toBeNull();
  });

  it("draws a daily view line for the tracker", () => {
    const series = shortsSeries(shorts, "color analysis", "US-GA");
    expect(series).toHaveLength(5);
    expect(series[0].day < series[series.length - 1].day).toBe(true);
    expect(series.every((p) => p.term === "color analysis" && p.geo === "US-GA")).toBe(true);
  });
});
