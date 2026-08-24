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
