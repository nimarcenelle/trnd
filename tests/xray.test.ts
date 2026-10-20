import { describe, expect, it } from "vitest";

import { aboveStrength, belowStrength, toneOf, xrayOf, XRAY_TILES } from "@/lib/preview/xray";
import type { ReadVideo } from "@/lib/tiktok/read";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const DAY = 86_400_000;
const video = (id: string, daysAgo: number, views: number | null, storedCover: string | null = null): ReadVideo => ({
  videoId: id,
  author: "me",
  url: null,
  caption: null,
  hashtags: [],
  sound: null,
  soundOriginal: null,
  durationS: null,
  coverUrl: null,
  storedCover,
  postedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  views,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
});

describe("tint strength", () => {
  it("grows on a log scale above usual, full at 8×", () => {
    expect(aboveStrength(1)).toBe(0);
    expect(aboveStrength(2)).toBeCloseTo(1 / 3);
    expect(aboveStrength(8)).toBe(1);
    expect(aboveStrength(40)).toBe(1);
    expect(aboveStrength(0.5)).toBe(0);
  });
  it("dims fully at half the usual or less, not at all at the usual", () => {
    expect(belowStrength(1)).toBe(0);
    expect(belowStrength(0.75)).toBeCloseTo(0.5);
    expect(belowStrength(0.5)).toBe(1);
    expect(belowStrength(0.1)).toBe(1);
  });
});

describe("toneOf", () => {
  it("reads a video against the usual band", () => {
    expect(toneOf(3, true).tone).toBe("above");
    expect(toneOf(1.1, true)).toEqual({ tone: "usual", strength: 0 });
    expect(toneOf(0.4, true)).toEqual({ tone: "below", strength: 1 });
    expect(toneOf(null, true).tone).toBe("unknown");
  });
  it("leaves a video still collecting views untinted", () => {
    expect(toneOf(5, false)).toEqual({ tone: "new", strength: 0 });
  });
});

describe("xrayOf", () => {
  it("orders the grid newest first and keeps the stored cover", () => {
    const x = xrayOf([video("old", 9, 100), video("new", 3, 100, "https://x/new.jpg"), video("mid", 6, 100)], NOW);
    expect(x.tiles.map((t) => t.id)).toEqual(["new", "mid", "old"]);
    expect(x.tiles[0].cover).toBe("https://x/new.jpg");
    expect(x.tiles[1].cover).toBeNull();
  });

  it("shows at most 24 tiles but reads the usual from every video", () => {
    const many = Array.from({ length: 30 }, (_, i) => video(`v${i}`, i + 3, 1000));
    const x = xrayOf(many, NOW);
    expect(x.tiles).toHaveLength(XRAY_TILES);
    expect(x.usual).toBe(1000);
  });

  it("lifts the two biggest breakouts with their real ×, not the one still settling", () => {
    const vids = [
      ...Array.from({ length: 8 }, (_, i) => video(`n${i}`, i + 3, 10_000)),
      video("big", 20, 63_000),
      video("second", 21, 31_000),
      video("third", 22, 25_000),
      video("fresh", 0.5, 90_000),
    ];
    const x = xrayOf(vids, NOW);
    expect(x.lifted.map((t) => [t.id, t.x])).toEqual([
      ["big", 6.3],
      ["second", 3.1],
    ]);
    expect(x.tiles.find((t) => t.id === "fresh")).toMatchObject({ tone: "new", lift: false });
    expect(x.tiles.filter((t) => t.lift)).toHaveLength(2);
  });

  it("lifts nothing when no video reached twice the usual", () => {
    const x = xrayOf([video("a", 3, 1000), video("b", 4, 1000), video("c", 5, 1900)], NOW);
    expect(x.lifted).toEqual([]);
    expect(x.tiles.find((t) => t.id === "c")?.tone).toBe("above");
  });

  it("has no usual without settled views, and tints nothing", () => {
    const x = xrayOf([video("a", 0.5, 1000), video("b", 3, null)], NOW);
    expect(x.usual).toBeNull();
    expect(x.tiles.map((t) => t.tone)).toEqual(["new", "unknown"]);
  });
});
