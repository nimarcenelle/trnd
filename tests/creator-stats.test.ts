import { describe, expect, it } from "vitest";

import { borrowScore, followerChange, matchIdea, normalOf, outcomeOf, perK, quantile, rankPeers, readVideo, stageOf, timesNormal, trendRows } from "@/lib/creators/stats";
import type { Idea } from "@/lib/db/types";

const now = Date.parse("2026-10-19T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("normalOf", () => {
  it("builds the typical range from settled videos only", () => {
    const vids = [10, 20, 30, 40, 50].map((k, i) => ({ views: k * 1000, saves: k * 10, comments: k, posted_at: daysAgo(i + 3) }));
    // A video posted an hour ago is still climbing: left out.
    vids.push({ views: 1, saves: 0, comments: 0, posted_at: new Date(now - 3_600_000).toISOString() });
    const n = normalOf(vids, now);
    expect(n).toMatchObject({ n: 5, views: 30000, low: 20000, high: 40000, savesPerK: 10, commentsPerK: 1 });
  });
  it("interpolates quantiles and handles empty input", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(quantile([], 0.5)).toBeNull();
    expect(perK(5, 2000)).toBe(2.5);
    expect(perK(5, 0)).toBeNull();
  });
});

describe("readVideo", () => {
  const normal = { n: 10, views: 10000, low: 6000, high: 15000, savesPerK: 5, commentsPerK: 2 };
  it("labels against the creator's own normal", () => {
    expect(readVideo({ views: 25000, saves: 0, comments: 0, posted_at: daysAgo(5) }, normal, now)).toBe("do_more");
    expect(readVideo({ views: 4000, saves: 0, comments: 0, posted_at: daysAgo(5) }, normal, now)).toBe("below");
    expect(readVideo({ views: 10000, saves: 10, comments: 50, posted_at: daysAgo(5) }, normal, now)).toBe("talked_about");
    expect(readVideo({ views: 10000, saves: 120, comments: 10, posted_at: daysAgo(5) }, normal, now)).toBe("saved");
    expect(readVideo({ views: 10000, saves: 50, comments: 20, posted_at: daysAgo(5) }, normal, now)).toBe("typical");
    expect(readVideo({ views: 90000, saves: 0, comments: 0, posted_at: daysAgo(1) }, normal, now)).toBe("too_new");
    expect(timesNormal(25000, normal)).toBe(2.5);
  });
});

describe("trends", () => {
  it("stages by this week against last week", () => {
    expect(stageOf(4, 0)).toBe("early");
    expect(stageOf(9, 4)).toBe("rising");
    expect(stageOf(5, 5)).toBe("peaking");
    expect(stageOf(2, 6)).toBe("fading");
    expect(stageOf(0, 3)).toBe("fading");
  });
  it("counts hashtags and borrowed sounds, not original sounds or one-creator tags", () => {
    const v = (author: string, d: number, tags: string[], sound: string | null, original: boolean | null, views = 100) => ({ author, posted_at: daysAgo(d), hashtags: tags, sound, sound_original: original, views });
    const rows = trendRows(
      [
        v("a", 1, ["firstgen", "collegeapps"], "Piano · Lo", false),
        v("b", 2, ["firstgen"], "Piano · Lo", false),
        v("c", 3, ["firstgen"], "original sound · c", true),
        v("a", 9, ["collegeapps"], null, null),
        v("b", 10, ["collegeapps"], null, null),
        v("z", 2, ["solo"], null, null),
        v("z", 30, ["firstgen"], null, null),
      ],
      now,
    );
    expect(rows.map((r) => [r.key, r.recent, r.prior, r.creators, r.stage])).toEqual([
      ["firstgen", 3, 0, 3, "early"],
      ["collegeapps", 1, 2, 2, "fading"],
      ["piano · lo", 2, 0, 2, "early"],
    ]);
  });
});

describe("borrowScore", () => {
  const normal = { n: 12, views: 50000, low: 30000, high: 80000, savesPerK: 8, commentsPerK: 3 };
  it("scores a fresh, saved, in-niche breakout high and an old off-niche flat one low", () => {
    const hit = borrowScore({ views: 400000, saves: 8000, hashtags: ["studytok", "aitools"], posted_at: daysAgo(4) }, normal, ["studytok", "aitools"], now);
    expect(hit.times).toBe(8);
    expect(hit.score).toBeGreaterThanOrEqual(95);
    const flat = borrowScore({ views: 50000, saves: 100, hashtags: ["vibes"], posted_at: daysAgo(40) }, normal, ["studytok"], now);
    expect(flat.score).toBeLessThan(15);
  });
});

describe("rankPeers", () => {
  it("keeps accounts within a tenth to ten times your size, the best niche fit first", () => {
    const out = rankPeers(
      [
        { handle: "me", followers: 50000, tags: 9, videos: 9 },
        { handle: "huge", followers: 9_000_000, tags: 5, videos: 5 },
        { handle: "tiny", followers: 900, tags: 5, videos: 5 },
        { handle: "close", followers: 60000, tags: 3, videos: 2 },
        { handle: "fit", followers: 300000, tags: 4, videos: 3 },
      ],
      { handle: "me", followers: 50000 },
      5,
    );
    expect(out.map((c) => c.handle)).toEqual(["fit", "close"]);
  });
});

describe("matchIdea and outcomes", () => {
  const idea = { hook: "I tested seven AI study tools for a week", caption: "One week, seven tools, real homework", hashtags: ["#aitools", "#studytok"] } as Idea;
  const run = { idea, added_at: daysAgo(5) };
  it("matches the video posted after the idea that shares its words", () => {
    const videos = [
      { id: "old", caption: "I tested seven AI study tools for a week", hashtags: [], posted_at: daysAgo(10) },
      { id: "other", caption: "Morning routine", hashtags: ["studytok"], posted_at: daysAgo(2) },
      { id: "it", caption: "Tested seven study tools in one week. Only two are worth it #aitools", hashtags: ["aitools"], posted_at: daysAgo(3) },
    ];
    expect(matchIdea(run, videos, new Set())?.id).toBe("it");
    expect(matchIdea(run, videos, new Set(["it"]))).toBeNull();
  });
  it("reads the result against the typical range", () => {
    expect(outcomeOf(90000, { low: 20000, high: 60000 })).toBe("beat");
    expect(outcomeOf(30000, { low: 20000, high: 60000 })).toBe("in_range");
    expect(outcomeOf(1000, { low: 20000, high: 60000 })).toBe("missed");
    expect(outcomeOf(null, { low: 1, high: 2 })).toBeNull();
  });
  it("measures follower change across the window", () => {
    expect(followerChange([{ followers: 100, captured_on: "2026-10-01" }, { followers: 160, captured_on: "2026-10-15" }], 30, now)).toEqual({ change: 60, days: 14 });
    expect(followerChange([{ followers: 100, captured_on: "2026-10-01" }], 30, now)).toBeNull();
  });
});

describe("compact", () => {
  it("drops trailing .0 and keeps one decimal only under 10", async () => {
    const { compact, signed } = await import("@/lib/format");
    expect([compact(36000), compact(12345), compact(2_400_000), compact(31_000_000), compact(9500), compact(null)]).toEqual(["36K", "12K", "2.4M", "31M", "9,500", "—"]);
    expect([signed(32000), signed(-450), signed(0)]).toEqual(["+32K", "−450", "0"]);
  });
});

describe("peerBand", () => {
  it("lets small and unknown-size accounts find creators a little ahead of them", async () => {
    const { peerBand, rankPeers } = await import("@/lib/creators/stats");
    expect(peerBand(50)).toEqual({ min: 1000, max: 20000 });
    expect(peerBand(null)).toEqual({ min: 1000, max: Infinity });
    expect(peerBand(500_000)).toEqual({ min: 50000, max: 5_000_000 });
    const cands = [
      { handle: "a", followers: 4000, tags: 3, videos: 2 },
      { handle: "b", followers: 900, tags: 4, videos: 2 },
    ];
    expect(rankPeers(cands, { handle: "me", followers: 50 }, 5).map((c) => c.handle)).toEqual(["a"]);
    expect(rankPeers(cands, { handle: "me", followers: null }, 5).map((c) => c.handle)).toEqual(["a"]);
  });
});
