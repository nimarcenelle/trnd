import { describe, expect, it } from "vitest";

import { creatorStats, headline, median, tierOf } from "@/lib/creator/stats";
import type { SocialPost } from "@/lib/db/types";

const post = (likes: number, day: number, comments = 0): SocialPost => ({
  url: `https://example.com/p/${day}`,
  caption: `post ${day}`,
  posted_at: new Date(Date.UTC(2026, 9, day)).toISOString(),
  likes,
  comments,
  views: null,
  kind: "video",
});

describe("median", () => {
  it("takes the middle, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("tierOf", () => {
  it("draws the lines at 2× and 0.5×", () => {
    expect(tierOf(2)).toBe("breakout");
    expect(tierOf(1.9)).toBe("typical");
    expect(tierOf(0.5)).toBe("stalled");
  });
});

describe("creatorStats", () => {
  it("measures each post against the creator's own median, newest first", () => {
    const s = creatorStats([post(100, 1), post(90, 2, 10), post(400, 3), post(40, 4), post(110, 5)])!;
    expect(s.medianInteractions).toBe(100);
    expect(s.posts.map((p) => p.posted_at?.slice(8, 10))).toEqual(["05", "04", "03", "02", "01"]);
    expect(s.posts.find((p) => p.interactions === 400)?.tier).toBe("breakout");
    expect(s.posts.find((p) => p.interactions === 40)?.tier).toBe("stalled");
    expect(s.breakouts).toBe(1);
    expect(s.stalled).toBe(1);
    expect(s.bestMultiple).toBe(4);
    expect(s.topShare).toBeCloseTo(400 / 750);
  });

  it("says nothing from too few posts or posts with no counts", () => {
    expect(creatorStats([post(1, 1), post(2, 2), post(3, 3)])).toBeNull();
    const hidden = { ...post(0, 1), likes: null, comments: null };
    expect(creatorStats([hidden, hidden, hidden, hidden, post(5, 2)])).toBeNull();
  });

  it("does not divide by a zero median", () => {
    const s = creatorStats([post(0, 1), post(0, 2), post(0, 3), post(6, 4)])!;
    expect(s.posts[0].multiple).toBe(6);
  });
});

describe("headline", () => {
  it("names a flat account plainly", () => {
    const s = creatorStats([post(10, 1), post(11, 2), post(12, 3), post(9, 4)])!;
    expect(headline(s)).toMatch(/^None of your last 4 posts/);
  });
});
