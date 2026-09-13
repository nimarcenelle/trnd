import { describe, expect, it } from "vitest";

import { absoluteLiftScore, BRAND_LOW_NOTE, BRAND_THIN_NOTE, engagementScore } from "../lib/scoring/brand";
import { NEUTRAL_PLACEHOLDER, scoreBrand, type BrandInput } from "../lib/scoring/index";

const liftBaseline = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6, 1.8];

const full = (over: Partial<BrandInput> = {}): BrandInput => ({
  adHistoryAds: 12,
  similarAdsCount: 3,
  similarAdsLift: 1.3,
  liftBaseline,
  economics: { fit: 0.8, priceBandMatch: true, inStock: true, marginOk: true },
  organic: { posts: 20, onTermPosts: 2, engagementRatio: 1.5 },
  settingsHref: "/settings/ads",
  ...over,
});

const brandNew = (): BrandInput => ({
  adHistoryAds: 0,
  similarAdsCount: 0,
  similarAdsLift: null,
  liftBaseline: [],
  economics: { fit: 0.9, priceBandMatch: null, inStock: null, marginOk: null },
  organic: { posts: 0, onTermPosts: 0, engagementRatio: null },
  settingsHref: "/settings/ads",
});

const comp = (s: ReturnType<typeof scoreBrand>, key: string) => s.components.find((c) => c.key === key)!;

describe("brand mappings", () => {
  it("maps lift on the absolute fallback curve", () => {
    expect(absoluteLiftScore(0.4)).toBe(0);
    expect(absoluteLiftScore(0.5)).toBe(0);
    expect(absoluteLiftScore(1)).toBe(50);
    expect(absoluteLiftScore(1.25)).toBe(75);
    expect(absoluteLiftScore(1.5)).toBe(100);
    expect(absoluteLiftScore(2)).toBe(100);
  });

  it("maps organic engagement with 1.0 at 50 and 2.0 at 100", () => {
    expect(engagementScore(0.5)).toBe(0);
    expect(engagementScore(0.75)).toBe(25);
    expect(engagementScore(1)).toBe(50);
    expect(engagementScore(1.5)).toBe(75);
    expect(engagementScore(2)).toBe(100);
    expect(engagementScore(3)).toBe(100);
  });

  it("ranks similar-ad lift against the brand's own past ads", () => {
    const s = scoreBrand(full());
    expect(comp(s, "similarity").score).toBe(70);
    expect(comp(s, "similarity").detail).toBe("3 past ads like this did 30% better than your usual, better than most of your ads");
  });

  it("leaves similarity out with no similar ads or no lift", () => {
    expect(comp(scoreBrand(full({ similarAdsCount: 0 })), "similarity").score).toBeNull();
    expect(comp(scoreBrand(full({ similarAdsLift: null })), "similarity").score).toBeNull();
  });

  it("builds economics from fit and the catalog facts", () => {
    const econ = (e: Partial<BrandInput["economics"]>) =>
      comp(scoreBrand(full({ economics: { ...full().economics, ...e } })), "economics");
    expect(econ({}).score).toBe(80);
    expect(econ({ priceBandMatch: false }).score).toBe(60);
    expect(econ({ priceBandMatch: false, marginOk: false }).score).toBe(45);
    expect(econ({ priceBandMatch: false, marginOk: false }).detail).toBe(
      "Fits your catalog well, but outside your price range and thin margin",
    );
    expect(econ({ inStock: false }).score).toBe(0);
    expect(econ({ fit: 0.1, priceBandMatch: false }).score).toBe(0);
    expect(econ({ fit: null, priceBandMatch: true, inStock: null, marginOk: null }).score).toBe(50);
    expect(econ({ fit: null, priceBandMatch: null, inStock: null, marginOk: null }).score).toBeNull();
  });

  it("leaves organic out when no posts are on the term", () => {
    expect(comp(scoreBrand(full()), "organic").score).toBe(75);
    expect(comp(scoreBrand(full({ organic: { posts: 20, onTermPosts: 0, engagementRatio: null } })), "organic").score).toBeNull();
  });
});

describe("scoreBrand confidence", () => {
  it("is high with 10+ ads, a ranked similarity, organic and economics", () => {
    const s = scoreBrand(full());
    expect(s.confidence).toBe("high");
    expect(s.score).toBe(Math.round(((40 * 70 + 30 * 80 + 30 * 75) / 100) * 10) / 10);
    expect(s.note).toBeNull();
    expect(s.cta).toBeNull();
  });

  it("caps at medium when lift falls back to the absolute curve", () => {
    const s = scoreBrand(full({ liftBaseline: [1, 1.2] }));
    expect(comp(s, "similarity").score).toBe(80);
    expect(s.confidence).toBe("medium");
  });

  it("is medium with fewer than 10 ads on record", () => {
    expect(scoreBrand(full({ adHistoryAds: 6 })).confidence).toBe("medium");
  });

  it("is medium with economics plus organic, weights redistributed", () => {
    const s = scoreBrand(full({ adHistoryAds: 0, similarAdsCount: 0, similarAdsLift: null, liftBaseline: [] }));
    expect(s.confidence).toBe("medium");
    expect(s.score).toBe(Math.round(((30 * 80 + 30 * 75) / 60) * 10) / 10);
  });

  it("is low for a brand-new brand with only catalog fit", () => {
    const s = scoreBrand(brandNew());
    expect(comp(s, "economics").score).toBe(90);
    expect(s.confidence).toBe("low");
    expect(s.score).toBe(NEUTRAL_PLACEHOLDER);
    expect(s.note).toBe(BRAND_LOW_NOTE);
    expect(s.cta).toEqual({ label: "Import past ads", href: "/settings/ads" });
  });

  it("is low with nothing at all", () => {
    const s = scoreBrand({ ...brandNew(), economics: { fit: null, priceBandMatch: null, inStock: null, marginOk: null } });
    expect(s.confidence).toBe("low");
    expect(s.note).toBe(BRAND_LOW_NOTE);
  });

  it("is low with a single history component and no catalog read", () => {
    const s = scoreBrand(
      full({
        economics: { fit: null, priceBandMatch: null, inStock: null, marginOk: null },
        organic: { posts: 0, onTermPosts: 0, engagementRatio: null },
      }),
    );
    expect(s.confidence).toBe("low");
    expect(s.note).toBe(BRAND_THIN_NOTE);
    expect(s.cta?.label).toBe("Import past ads");
  });

  it("writes plain details with no em dashes, arrows or jargon", () => {
    for (const c of [...scoreBrand(full()).components, ...scoreBrand(brandNew()).components]) {
      expect(c.detail).toBeTruthy();
      expect(c.detail).not.toMatch(/[—→]|percentile/i);
    }
  });
});
