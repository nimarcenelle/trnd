import { describe, expect, it } from "vitest";

import { BUILD_AT, DECIDE_AFTER, funnel, verdict, within, type FunnelEvent } from "@/lib/creator/funnel";
import { creatorStats, diagnosis, headline, killerFromNumbers, median, stuckCount, theirs, tierOf } from "@/lib/creator/stats";
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

const ev = (kind: string, src: string | null = null, handle: string | null = "a", daysAgo = 0): FunnelEvent => ({
  kind,
  handle,
  src,
  created_at: new Date(Date.UTC(2026, 10, 6) - daysAgo * 86_400_000).toISOString(),
});

describe("funnel", () => {
  it("counts each step and rates them against completed checks", () => {
    const f = funnel([ev("check", "bio-tt", "a"), ev("check", "bio-tt", "b"), ev("check", null, "a"), ev("check_failed"), ev("upgrade_click", "bio-tt"), ev("waitlist", "bio-tt"), ev("lead"), ev("teardown", "td-x")]);
    expect(f).toMatchObject({ checks: 3, failed: 1, creators: 2, upgrades: 1, waitlist: 1, leads: 1, teardowns: 1 });
    expect(f.upgradeRate).toBeCloseTo(1 / 3);
    expect(f.bySource).toEqual([
      { src: "bio-tt", checks: 2, upgrades: 1, waitlist: 1, leads: 0 },
      { src: "direct", checks: 1, upgrades: 0, waitlist: 0, leads: 1 },
    ]);
  });

  it("has no rate before the first check", () => {
    expect(funnel([ev("upgrade_click")]).upgradeRate).toBeNull();
  });

  it("windows by age", () => {
    const now = Date.UTC(2026, 10, 6, 12);
    expect(within([ev("check", null, "a", 0), ev("check", null, "a", 10)], 7, now)).toHaveLength(1);
  });
});

describe("verdict", () => {
  it("waits for enough checks, then holds the rate to the bar set in advance", () => {
    expect(verdict({ checks: DECIDE_AFTER - 1, paidRate: 0.5 })).toBe("collecting");
    expect(verdict({ checks: DECIDE_AFTER, paidRate: BUILD_AT })).toBe("build");
    expect(verdict({ checks: DECIDE_AFTER, paidRate: 0.005 })).toBe("rework");
    expect(verdict({ checks: DECIDE_AFTER, paidRate: 0.02 })).toBe("keep_testing");
  });
});

describe("funnel sharing", () => {
  it("counts shares, views of shared results and the checks they started", () => {
    const f = funnel([ev("check", "shared"), ev("check", "bio-tt"), ev("share"), ev("share"), ev("share_view", "shared")]);
    expect(f).toMatchObject({ shares: 2, shareViews: 1, fromShares: 1 });
  });
});

describe("headline voice", () => {
  it("says their for a shared result", () => {
    const s = creatorStats([post(100, 1), post(400, 2), post(90, 3), post(110, 4)])!;
    expect(headline(s, "their")).toMatch(/^1 of their last 4 posts broke out/);
  });
});

describe("diagnosis", () => {
  const stats = (mults: number[]) => creatorStats(mults.map((m, i) => post(Math.round(100 * m), i + 1)))!;
  it("counts the posts that never got past their followers", () => {
    const s = stats([1, 3, 1, 0.3, 1, 1]);
    expect(stuckCount(s)).toBe(5);
    expect(diagnosis(s)).toBe("5 of your last 6 posts never got past your followers.");
    expect(diagnosis(s, "their")).toBe("5 of their last 6 posts never got past their followers.");
  });
  it("names what's killing the posts from the numbers when there is no read", () => {
    expect(killerFromNumbers(stats([1, 1.1, 0.9, 1, 1.2, 0.8]))).toMatch(/^None of your posts/);
    expect(killerFromNumbers(stats([1, 1, 1, 6, 1, 0.9]))).toMatch(/^You had one hit/);
    expect(killerFromNumbers(stats([1, 3, 0.3, 3, 0.2, 0.4, 0.3, 1, 1.2, 3]))).toMatch(/lost even your regulars/);
  });
  it("speaks about someone else when shared", () => {
    expect(theirs("Your best post got 4× your usual, so you're close.")).toBe("Their best post got 4× their usual, so they're close.");
  });
});
