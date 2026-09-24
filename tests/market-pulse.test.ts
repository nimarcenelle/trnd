import { describe, expect, it } from "vitest";

import type { Repo } from "../lib/db/repo";
import type { Business, CompetitorRead } from "../lib/db/types";
import { adsFromRead, buildMarketPulse, pickSample, scrub } from "../lib/read/market";
import type { AdvertiserAd } from "../lib/signals/adlibrary-apify";

/**
 * The landing page's real numbers: the week's stored rival reads summed by
 * category, and one category laid out as a sample with every brand renamed.
 */

const NOW = new Date("2026-09-24T12:00:00Z");
const day = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400_000).toISOString().slice(0, 10);

function read(businessId: string, competitorId: string, advertiser: string, ads: [number, string][], source = "apify"): CompetitorRead {
  return {
    id: `${businessId}-${competitorId}`,
    competitor_id: competitorId,
    business_id: businessId,
    kind: "ads",
    value: ads.length,
    rating: null,
    summary: "",
    raw: { source, ads: ads.map(([d, snippet], i) => ({ advertiser, snippet, headline: null, startedOn: day(d), url: `https://www.facebook.com/ads/library/?id=${advertiser}${i}` })) },
    captured_at: NOW.toISOString(),
  };
}

function fakeRepo(businesses: Partial<Business>[], reads: CompetitorRead[]): Repo {
  return {
    listAllBusinesses: async () => businesses as Business[],
    listCompetitorReads: async (id: string) => reads.filter((r) => r.business_id === id),
  } as unknown as Repo;
}

describe("adsFromRead", () => {
  it("reads only what the live Ad Library path stored, with running days counted from today", () => {
    const live = adsFromRead(read("b", "c", "Clearwell", [[40, "Sick of dry hair."]]), NOW);
    expect(live).toHaveLength(1);
    expect(live[0].runningDays).toBe(40);
    expect(adsFromRead(read("b", "c", "Clearwell", [[40, "x"]], "seed"), NOW)).toEqual([]);
    expect(adsFromRead({ raw: null }, NOW)).toEqual([]);
  });
});

describe("scrub", () => {
  it("takes every brand name, its distinctive words, links and handles out of the copy", () => {
    const names = [
      { name: "Clearwell Co", label: "Brand A" },
      { name: "Softstream", label: "[brand]" },
    ];
    const out = scrub("Clearwell beats Softstream. Shop clearwell.com or @clearwellhq, see https://x.co/abc", names);
    expect(out).toBe("Brand A beats [brand]. Shop [link] or [handle], see [link]");
    expect(out.toLowerCase()).not.toContain("clearwell");
    expect(out.toLowerCase()).not.toContain("softstream");
  });

  it("never scrubs a word of the category, even when a brand's name contains it", () => {
    const out = scrub("Hair that feels like straw after every shower.", [{ name: "Shower filters brand", label: "[brand]", words: false }, { name: "Shower Pure", label: "Brand B" }], ["Shower filters"]);
    expect(out).toBe("Hair that feels like straw after every shower.");
    expect(scrub("Shower Pure works.", [{ name: "Shower Pure", label: "Brand B" }], ["Shower filters"])).toBe("Brand B works.");
  });

  it("leaves ordinary words that only contain a name alone", () => {
    expect(scrub("Rinsed and ready.", [{ name: "Rinse", label: "Brand A" }])).toBe("Rinsed and ready.");
  });
});

describe("pickSample", () => {
  const ad = (advertiser: string, d: number, snippet: string): AdvertiserAd => ({
    id: `${advertiser}${d}`,
    advertiser,
    snippet,
    headline: null,
    cta: null,
    landing: null,
    startedOn: day(d),
    runningDays: d,
    platforms: [],
    variants: 1,
    active: true,
    url: "https://www.facebook.com/ads/library/?id=1",
  });
  const byAdvertiser = new Map<string, AdvertiserAd[]>([
    ["Clearwell", [ad("Clearwell", 90, "Sick of dry hair every winter. Clearwell fixes it."), ad("Clearwell", 40, "Tired of flaky skin.")]],
    ["Softstream", [ad("Softstream", 80, "Sick of the crust on your showerhead.")]],
    ["Aquaveil", [ad("Aquaveil", 60, "Tired of dull hair. Try Aquaveil.")]],
    ["Rinse", [ad("Rinse", 50, "Meet the filter that installs in a minute.")]],
  ]);

  it("seats the brand with the clearest gap, and names nobody anywhere in the result", () => {
    const sample = pickSample("Shower filters", byAdvertiser, ["My Shop"]);
    expect(sample).not.toBeNull();
    expect(sample!.own.name).toBe("Brand A");
    expect(sample!.rivals.map((r) => r.name)).toEqual(["Brand B", "Brand C", "Brand D"]);
    expect(sample!.gap.kind).toBe("missing");
    expect(sample!.gap.opening).toBe("problem");
    const everything = JSON.stringify(sample).toLowerCase();
    for (const real of ["clearwell", "softstream", "aquaveil", "rinse", "facebook.com"]) expect(everything).not.toContain(real);
  });

  it("needs three advertisers with words before it lays anything out", () => {
    const two = new Map([...byAdvertiser.entries()].slice(0, 2));
    expect(pickSample("Shower filters", two, [])).toBeNull();
  });
});

describe("buildMarketPulse", () => {
  const businesses = [
    { id: "b1", name: "Rinse", category: "Shower filters" },
    { id: "b2", name: "Other Filter Co", category: "shower filters" },
    { id: "b3", name: "Solo Skincare", category: "Skincare" },
  ];
  const reads = [
    read("b1", "c1", "Clearwell", [[118, "Sick of dry hair every winter."], [12, "20% off this weekend."]]),
    read("b1", "c2", "Softstream", [[96, "Tired of the crust on your showerhead."]]),
    read("b2", "c3", "Aquaveil", [[131, "Sick of dull hair after every wash."]]),
    // The same rival watched by two brands counts once.
    read("b2", "c4", "Clearwell", [[118, "Sick of dry hair every winter."]]),
    read("b2", "c5", "Hydrine", [[88, "Watch what hard water leaves behind."]]),
    // A category with fewer than three advertisers is never shown.
    read("b3", "c6", "Glowco", [[200, "Meet your new serum."]]),
    read("b3", "c7", "Dewly", [[150, "Meet the moisturizer."]]),
  ];

  it("sums the week by category, counts a shared rival once and hides thin categories", async () => {
    const pulse = await buildMarketPulse(fakeRepo(businesses, reads), NOW);
    expect(pulse.categories).toHaveLength(1);
    const c = pulse.categories[0];
    expect(c.category).toBe("Shower filters");
    expect(c.brands).toBe(4);
    expect(c.longestDays).toBe(131);
    expect(c.topOpening).toBe("problem");
    expect(pulse.brands).toBe(4);
    expect(pulse.stillRunning).toBe(4);
    expect(pulse.sample?.category).toBe("Shower filters");
    expect(JSON.stringify(pulse.sample).toLowerCase()).not.toMatch(/clearwell|softstream|aquaveil|hydrine|rinse/);
  });

  it("returns an empty pulse, never an error, when the store fails or holds nothing live", async () => {
    const broken = { listAllBusinesses: async () => Promise.reject(new Error("down")) } as unknown as Repo;
    expect(await buildMarketPulse(broken, NOW)).toEqual({ brands: 0, ads: 0, stillRunning: 0, categories: [], sample: null });
    const seeded = reads.map((r) => ({ ...r, raw: { ...(r.raw as object), source: "seed" } }));
    expect((await buildMarketPulse(fakeRepo(businesses, seeded), NOW)).categories).toEqual([]);
  });
});
