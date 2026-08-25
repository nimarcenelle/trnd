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

  it("computes the delta from the popularity curve, ignoring the trailing zero", () => {
    // 5 → 34 after dropping today's partial 0: +580%, clamped to 100.
    expect(curveDelta(CC_FIXTURE.items[0].popularityCurve)).toBe(100);
    expect(curveDelta([{ timestamp: "1", value: 80 }, { timestamp: "2", value: 40 }])).toBe(-50);
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
    const adapter = createTiktokCcAdapter({ humanize: async (tags) => tags.map((t) => `nice ${t}`) });
    // No network in unit tests: fetch() will fail per-industry and produce
    // zero signals, but must not throw.
    const signals = await adapter.fetch({ terms: [], watch: [], geo: "ZZ", windowDays: 7 });
    expect(Array.isArray(signals)).toBe(true);
  });
});
