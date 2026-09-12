import { describe, expect, it } from "vitest";

import type { ProposedBrand } from "../lib/ai/rivals";
import type { Repo } from "../lib/db/repo";
import type { Business, Competitor, NewCompetitor, Service } from "../lib/db/types";
import type { RivalSiteRead } from "../lib/intel/direct";
import { brandDomain, discoverCompetingBrands, isMarketplace, type BrandDiscoveryOptions } from "../lib/intel/discover-brands";
import type { AdvertiserAd } from "../lib/signals/adlibrary-apify";

const BUSINESS: Business = {
  id: "biz-1",
  owner_id: "owner-1",
  name: "Bellwood Skin",
  category: "Beauty & skincare",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 0,
  website: "https://bellwoodskin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "online",
  monthly_ad_spend: "50-100k",
  ad_platforms: ["meta", "tiktok"],
  created_at: "2026-09-12T00:00:00Z",
};

const SERVICES: Service[] = [
  { id: "s1", business_id: "biz-1", name: "Barrier Repair Serum", description: null, price_cents: 3800, is_active: true },
  { id: "s2", business_id: "biz-1", name: "Ceramide Moisturizer", description: null, price_cents: 4200, is_active: true },
  { id: "s3", business_id: "biz-1", name: "Gentle Cleanser", description: null, price_cents: 2400, is_active: true },
];

const SKINCARE_SITE: RivalSiteRead = {
  text: "Clean skincare for sensitive skin. Barrier repair serum, ceramide moisturizer, gentle cleanser.",
  services: [
    { name: "Barrier Repair Serum", price: "36" },
    { name: "Ceramide Moisturizer", price: "40" },
    { name: "Gentle Cleanser", price: "22" },
  ],
  priceBand: "$$",
  handles: {},
};

const brand = (name: string, website: string, extra: Partial<ProposedBrand> = {}): ProposedBrand => ({
  name,
  website,
  instagram: null,
  tiktok: null,
  why: "Same serums at the same price.",
  ...extra,
});

function fakeRepo(existing: Competitor[] = []) {
  const created: NewCompetitor[] = [];
  const repo = {
    listCompetitors: async () => existing,
    listServices: async () => SERVICES,
    getBusinessBrief: async () => null,
    createCompetitor: async (input: NewCompetitor) => {
      created.push(input);
      return { id: `c-${created.length}`, created_at: "2026-09-12T00:00:00Z", social_handles: {}, directness: null, directness_reason: null, ...input } as Competitor;
    },
  } as unknown as Repo;
  return { repo, created };
}

const ad = (advertiser: string, id: string, active = true): AdvertiserAd => ({
  id,
  advertiser,
  snippet: "Repair your barrier in 7 days",
  headline: null,
  cta: null,
  landing: null,
  startedOn: "2026-09-01",
  runningDays: 11,
  platforms: ["facebook", "instagram"],
  variants: 1,
  active,
  url: `https://www.facebook.com/ads/library/?id=${id}`,
});

const baseOpts = (brands: ProposedBrand[], sites: Record<string, RivalSiteRead | null>): BrandDiscoveryOptions => ({
  propose: async () => brands,
  readSite: async (url) => sites[brandDomain(url) ?? ""] ?? null,
  adsAvailable: () => false,
});

describe("discoverCompetingBrands", () => {
  it("drops a brand whose site doesn't load, since that is usually an invented domain", async () => {
    const { repo, created } = fakeRepo();
    const out = await discoverCompetingBrands(
      repo,
      BUSINESS,
      baseOpts([brand("Real Skin Co", "realskin.co"), brand("Dewy Madeup", "dewymadeup-skincare.com")], {
        "realskin.co": SKINCARE_SITE,
      }),
    );
    expect(created.map((c) => c.name)).toEqual(["Real Skin Co"]);
    expect(created[0].website).toBe("https://realskin.co");
    expect(out.note).toBeNull();
  });

  it("takes handles from the site first and the model second", async () => {
    const { repo, created } = fakeRepo();
    await discoverCompetingBrands(
      repo,
      BUSINESS,
      baseOpts(
        [brand("Real Skin Co", "https://www.realskin.co/shop", { instagram: "@wrong_guess", tiktok: "https://www.tiktok.com/@RealSkinTok" })],
        { "realskin.co": { ...SKINCARE_SITE, handles: { instagram: "realskinco" } } },
      ),
    );
    expect(created[0].social_handles).toEqual({ instagram: "realskinco", tiktok: "realskintok" });
  });

  it("ranks a brand running ads above an equal one that isn't, and says so without distance", async () => {
    const { repo, created } = fakeRepo();
    const asked: string[] = [];
    await discoverCompetingBrands(repo, BUSINESS, {
      ...baseOpts([brand("Quiet Skin", "quietskin.com"), brand("Loud Skin", "loudskin.com")], {
        "quietskin.com": SKINCARE_SITE,
        "loudskin.com": SKINCARE_SITE,
      }),
      adsAvailable: () => true,
      fetchAds: async (name) => {
        asked.push(name);
        if (name !== "Loud Skin") return [];
        // Another advertiser and a stopped ad the library also returned: neither counts.
        return [
          ...Array.from({ length: 14 }, (_, i) => ad("Loud Skin", `a${i}`)),
          ad("Some Other Page", "x1"),
          ad("Loud Skin", "old", false),
        ];
      },
    });
    expect(asked.sort()).toEqual(["Loud Skin", "Quiet Skin"]);
    expect(created.map((c) => c.name)).toEqual(["Loud Skin", "Quiet Skin"]);
    expect(created[0].directness).toBeGreaterThan(created[1].directness ?? 0);
    expect(created[0].directness_reason).toContain("runs 14 Meta ads right now");
    expect(created[1].directness_reason).not.toContain("Meta ad");
    for (const c of created) {
      expect(c.directness_reason).not.toMatch(/miles? away/);
      expect(c.directness_reason).not.toMatch(/[—–→]/);
    }
  });

  it("filters out marketplaces the model returns, without reading their sites", async () => {
    const { repo, created } = fakeRepo();
    const read: string[] = [];
    await discoverCompetingBrands(repo, BUSINESS, {
      ...baseOpts([brand("Sephora", "sephora.com"), brand("Amazon Beauty", "amazon.com"), brand("Real Skin Co", "realskin.co")], {}),
      readSite: async (url) => {
        read.push(url);
        return SKINCARE_SITE;
      },
    });
    expect(created.map((c) => c.name)).toEqual(["Real Skin Co"]);
    expect(read.some((u) => /sephora|amazon/.test(u))).toBe(false);
    expect(isMarketplace({ name: "Ulta Beauty", website: "https://www.ulta.com" })).toBe(true);
    expect(isMarketplace({ name: "Tower 28", website: "tower28beauty.com" })).toBe(false);
  });

  it("never creates more than five, counts the rivals already watched, and reads five at a time", async () => {
    const brands = Array.from({ length: 12 }, (_, i) => brand(`Brand ${i}`, `brand${i}.com`));
    let inFlight = 0;
    let peak = 0;
    const readSite: BrandDiscoveryOptions["readSite"] = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return SKINCARE_SITE;
    };
    const fresh = fakeRepo();
    await discoverCompetingBrands(fresh.repo, { ...BUSINESS, website: null }, { ...baseOpts(brands, {}), readSite });
    expect(fresh.created).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(5);

    const watched = [
      { id: "e1", name: "Brand 0", website: "https://brand0.com" },
      { id: "e2", name: "Somebody Else", website: null },
    ] as Competitor[];
    const partly = fakeRepo(watched);
    await discoverCompetingBrands(partly.repo, BUSINESS, { ...baseOpts(brands, {}), readSite });
    expect(partly.created).toHaveLength(3);
    expect(partly.created.map((c) => c.name)).not.toContain("Brand 0");
  });

  it("never throws when the model or a site read fails", async () => {
    const { repo, created } = fakeRepo();
    const failed = await discoverCompetingBrands(repo, BUSINESS, {
      propose: () => Promise.reject(new Error("quota")),
      readSite: async () => SKINCARE_SITE,
      adsAvailable: () => false,
    });
    expect(failed.created).toEqual([]);
    expect(failed.note).toMatch(/Couldn't name brands/);

    const unreadable = await discoverCompetingBrands(repo, BUSINESS, {
      propose: async () => [brand("Real Skin Co", "realskin.co")],
      readSite: () => Promise.reject(new Error("ECONNRESET")),
      adsAvailable: () => false,
    });
    expect(unreadable.created).toEqual([]);
    expect(unreadable.note).toMatch(/had a site we could read/);
    expect(created).toHaveLength(0);
  });
});
