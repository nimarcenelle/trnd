import { describe, expect, it } from "vitest";

import { assessAdRead, isLatinText, isRelevantAd, relevantAds } from "../lib/signals/ad-relevance";

// The live sample a NYC bike shop was shown on 2026-09-10, verbatim in
// spirit: a keyword search's idea of "competitors".
const sample = [
  { advertiser: "Lectric eBikes", snippet: "Here are the 3 most common questions riders have about Lectric eBikes before buying" },
  { advertiser: "Mj Sales", snippet: "2026 Royal Enfield Himalayan 450 - $6,874.00 . ABS There is no pre" },
  { advertiser: "FRP", snippet: "6+ months riding? Time for a tune-up! High-quality parts for your mini motorcycle." },
  { advertiser: "Pluzzzz Hnq", snippet: "شاهد الحلقة القادمة الآن! شاهد أفلامًا دون اتصال بالإنترنت مجانًا" },
  { advertiser: "Rebellion Roads Electric Bikes", snippet: "Bike or ebike feeling off? Our bike tune-ups improve shifting, braking, and overall ride quality." },
];

describe("ad relevance", () => {
  it("drops other industries and non-Latin spam, keeps the ad that speaks to the term", () => {
    const kept = relevantAds(sample, "bike tune up nyc", ["New York", "NY"]);
    expect(kept.map((a) => a.advertiser)).toEqual(["Rebellion Roads Electric Bikes"]);
  });

  it("a motorcycle tune-up is not a bike tune-up, and an e-bike brand is not a tune-up", () => {
    expect(isRelevantAd(sample[2], "bike tune up")).toBe(false);
    expect(isRelevantAd(sample[0], "bike tune up")).toBe(false);
  });

  it("needs most of a longer term's core words, and ignores the city and filler", () => {
    expect(isRelevantAd({ advertiser: "Cravot", snippet: "Heavy E-Bike? Tired of lifting it onto a repair stand?" }, "e-bike repair shop")).toBe(true);
    expect(isRelevantAd({ advertiser: "Airpark Bike Co", snippet: "Get your dream bike shipped right to your door." }, "bike assembly service")).toBe(false);
    expect(isRelevantAd({ advertiser: "Fix-It Cycles", snippet: "Flat tire repair while you wait, Brooklyn." }, "flat tire repair near me", ["New York", "NY"])).toBe(true);
  });

  it("reads script, not language names", () => {
    expect(isLatinText("Tune-ups from $99 — book today")).toBe(true);
    expect(isLatinText("شاهد الحلقة القادمة الآن")).toBe(false);
    expect(isLatinText("🚲🚲🚲")).toBe(false);
  });

  it("a mostly-noise sample makes the count unusable; no sample leaves it usable", () => {
    const noisy = assessAdRead(sample, "bike tune up nyc", ["New York", "NY"], 520);
    expect(noisy.unrelated).toBe(4);
    expect(noisy.countUsable).toBe(false);
    expect(noisy.count).toBeNull();
    expect(assessAdRead([], "bike tune up nyc", [], 12)).toMatchObject({ countUsable: true, count: 12 });
    expect(assessAdRead(null, "bike tune up nyc").countUsable).toBe(true);
    const clean = assessAdRead([sample[4], { advertiser: "Bike Bros", snippet: "Bike tune ups $79 this week" }], "bike tune up", [], 40);
    expect(clean.countUsable).toBe(true);
    expect(clean.unrelated).toBe(0);
    expect(clean.count).toBe(40);
  });

  it("two real rivals in a noisy sample keep the read, scaled to the relevant share", () => {
    const mixed = [
      { advertiser: "Cravot", snippet: "Heavy E-Bike? Tired of lifting it onto a repair stand?" },
      { advertiser: "Wrench and Roll", snippet: "Long Island's premier driveway mobile bicycle repair service." },
      sample[1],
      sample[2],
      sample[3],
    ];
    const read = assessAdRead(mixed, "e-bike repair shop", ["New York", "NY"], 49);
    expect(read.countUsable).toBe(true);
    expect(read.ads.map((a) => a.advertiser)).toEqual(["Cravot", "Wrench and Roll"]);
    expect(read.count).toBe(20);
  });
});
