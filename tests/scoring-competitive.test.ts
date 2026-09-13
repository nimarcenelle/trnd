import { describe, expect, it } from "vitest";

import { HIGH_EVIDENCE_ITEMS, NO_COMPETITORS_NOTE, NOTHING_READ_NOTE } from "../lib/scoring/competitive";
import { NEUTRAL_PLACEHOLDER, scoreCompetitive, type CompetitiveInput } from "../lib/scoring/index";

const full = (over: Partial<CompetitiveInput> = {}): CompetitiveInput => ({
  competitorsConnected: 6,
  competitorsRead: 5,
  rivalsOnAngleNow: 2,
  rivalsOnAnglePrior: 3,
  rivalAdsOnAngle: 4,
  weakRivalAds: 2,
  settingsHref: "/settings/competitors",
  ...over,
});

const comp = (s: ReturnType<typeof scoreCompetitive>, key: string) => s.components.find((c) => c.key === key)!;

describe("competitive guardrail", () => {
  it("computes nothing with zero competitors connected", () => {
    const s = scoreCompetitive(full({ competitorsConnected: 0, competitorsRead: 0, rivalsOnAngleNow: 0 }));
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(NO_COMPETITORS_NOTE);
    expect(s.cta).toEqual({ label: "Add competitors", href: "/settings/competitors" });
    expect(s.components.every((c) => c.score === null)).toBe(true);
  });

  it("ignores stray rival numbers when nothing is connected", () => {
    const s = scoreCompetitive(full({ competitorsConnected: 0 }));
    expect(s.confidence).toBe("low");
    expect(s.components.every((c) => c.score === null)).toBe(true);
  });

  it("is low when competitors are connected but nothing was read", () => {
    const s = scoreCompetitive(full({ competitorsRead: 0 }));
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(NOTHING_READ_NOTE);
    expect(s.components.every((c) => c.score === null)).toBe(true);
  });
});

describe("competitive components", () => {
  it("scores whitespace as the share of competitors not on the angle", () => {
    const s = scoreCompetitive(full());
    expect(comp(s, "whitespace").score).toBe(60);
    expect(comp(s, "whitespace").detail).toBe("2 of 5 competitors already run this angle");
    const open = scoreCompetitive(full({ rivalsOnAngleNow: 0 }));
    expect(comp(open, "whitespace").score).toBe(100);
    expect(comp(open, "whitespace").detail).toBe("None of the 5 competitors read run this angle");
  });

  it("scores the saturation trend: falling good, rising bad", () => {
    expect(comp(scoreCompetitive(full({ rivalsOnAnglePrior: 3 })), "saturation").score).toBe(80);
    expect(comp(scoreCompetitive(full({ rivalsOnAnglePrior: 2 })), "saturation").score).toBe(50);
    expect(comp(scoreCompetitive(full({ rivalsOnAnglePrior: 1 })), "saturation").score).toBe(20);
    expect(comp(scoreCompetitive(full({ rivalsOnAnglePrior: null })), "saturation").score).toBeNull();
  });

  it("scores competitor weakness as the weak share of their ads on the angle", () => {
    const s = scoreCompetitive(full({ rivalAdsOnAngle: 4, weakRivalAds: 3 }));
    expect(comp(s, "weakness").score).toBe(75);
    expect(comp(s, "weakness").detail).toBe("3 of 4 competitor ads on this angle look weak");
    expect(comp(scoreCompetitive(full({ rivalAdsOnAngle: 0, weakRivalAds: 0 })), "weakness").score).toBeNull();
  });
});

describe("scoreCompetitive", () => {
  it("is high with 3+ competitors read and a known prior window", () => {
    const s = scoreCompetitive(full());
    expect(s.confidence).toBe("high");
    expect(s.score).toBe(Math.round(((45 * 60 + 30 * 80 + 25 * 50) / 100) * 10) / 10);
    expect(s.note).toBeNull();
    expect(s.cta).toBeNull();
  });

  it("is medium with fewer than 3 read", () => {
    expect(scoreCompetitive(full({ competitorsRead: 2, rivalsOnAngleNow: 1 })).confidence).toBe("medium");
  });

  it("is medium and redistributes weight when the prior window is unread", () => {
    const s = scoreCompetitive(full({ rivalsOnAnglePrior: null }));
    expect(s.confidence).toBe("medium");
    expect(s.score).toBe(Math.round(((45 * 60 + 25 * 50) / 70) * 10) / 10);
  });

  it("clamps rivals on the angle to competitors read", () => {
    expect(comp(scoreCompetitive(full({ rivalsOnAngleNow: 9 })), "whitespace").score).toBe(0);
  });

  it("writes plain details with no em dashes or arrows", () => {
    for (const c of scoreCompetitive(full()).components) expect(c.detail).not.toMatch(/[—→]/);
  });
});

describe("how much stands behind the read", () => {
  it("is medium, not high, when three rivals were read but barely", () => {
    expect(scoreCompetitive(full({ evidenceItems: 3 })).confidence).toBe("medium");
    expect(scoreCompetitive(full({ evidenceItems: HIGH_EVIDENCE_ITEMS })).confidence).toBe("high");
    expect(scoreCompetitive(full()).confidence).toBe("high");
  });
});
