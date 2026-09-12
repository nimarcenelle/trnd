import { describe, expect, it } from "vitest";

import type { Repo } from "../lib/db/repo";
import type { Business, Competitor, NewCompetitor } from "../lib/db/types";
import {
  enrichCompetitor,
  readRivalSite,
  scoreDirectness,
  UNREAD_DIRECTNESS_CAP,
  type DirectnessInput,
  type RivalSiteRead,
} from "../lib/intel/direct";
import { orderByDirectness } from "../lib/intel/seed-competitors";

const OWN_SERVICES = [
  { name: "Espresso", price_cents: 350 },
  { name: "Cortado", price_cents: 450 },
  { name: "Cappuccino", price_cents: 500 },
  { name: "Oat Milk Latte", price_cents: 600 },
  { name: "Cold Brew", price_cents: 500 },
  { name: "Butter Croissant", price_cents: 400 },
  { name: "Almond Croissant", price_cents: 475 },
];

const base = (rival: DirectnessInput["rival"]): DirectnessInput => ({
  ownServices: OWN_SERVICES,
  ownCategory: "Restaurants & cafés",
  ownPriceBand: "$$",
  ownLexicon: ["espresso", "pour over", "cortado"],
  rival,
});

const CAFE_SITE: RivalSiteRead = {
  text: "Little Owl Coffee. Espresso bar and bakery. Cortado, cappuccino, vanilla latte, cold brew, croissants baked daily.",
  services: [
    { name: "Espresso", price: "3.5" },
    { name: "Cortado", price: "4.5" },
    { name: "Cappuccino", price: "5" },
    { name: "Vanilla Latte", price: "5.5" },
    { name: "Cold Brew", price: "5" },
    { name: "Almond Croissant", price: "4.75" },
  ],
  priceBand: "$$",
  handles: { instagram: "littleowlcoffee" },
};

const DINER_SITE: RivalSiteRead = {
  text: "Family diner since 1962. Breakfast all day, burgers and blue plate specials. Bottomless coffee.",
  services: [
    { name: "Two Eggs Any Style", price: "9" },
    { name: "Pancake Stack", price: "8" },
    { name: "Patty Melt", price: "13" },
    { name: "Club Sandwich", price: "12" },
    { name: "Chicken Fried Steak", price: "15" },
    { name: "Bottomless Coffee", price: "3" },
  ],
  priceBand: "$",
  handles: {},
};

describe("scoreDirectness", () => {
  it("scores the same menu at the same prices nearby as a direct rival", () => {
    const { directness, reason } = scoreDirectness(
      base({ name: "Little Owl Coffee", distanceMiles: 0.8, site: CAFE_SITE }),
    );
    expect(directness).toBeGreaterThanOrEqual(0.75);
    expect(reason).toMatch(/^Sells the same /);
    expect(reason).toContain("at your prices");
    expect(reason).toContain("0.8 miles away");
  });

  it("scores a same-category place with a different menu low, even next door", () => {
    const direct = scoreDirectness(base({ name: "Little Owl Coffee", distanceMiles: 0.8, site: CAFE_SITE }));
    const diner = scoreDirectness(
      base({ name: "Starlite Diner", category: "Diner", distanceMiles: 0.1, site: DINER_SITE }),
    );
    expect(diner.directness).toBeLessThan(0.4);
    expect(diner.directness).toBeLessThan(direct.directness);
    expect(diner.reason).toMatch(/^Same category, but little of your menu shows up at this diner/);
  });

  it("caps an unread rival at 0.6 and says the site wasn't read", () => {
    // A name made of the owner's own menu words still can't pass the cap.
    const { directness, reason } = scoreDirectness(
      base({ name: "Espresso Cortado Cappuccino Latte Cold Brew Croissant", distanceMiles: 0.3, site: null }),
    );
    expect(directness).toBeLessThanOrEqual(UNREAD_DIRECTNESS_CAP);
    expect(reason).toMatch(/couldn't read their website/);
    expect(reason).toContain("0.3 miles away");
  });

  it("mentions distance only when it is known, and never uses dashes or arrows", () => {
    const known = scoreDirectness(base({ name: "Little Owl Coffee", distanceMiles: 1, site: CAFE_SITE }));
    expect(known.reason).toContain("1 mile away");
    const unknown = scoreDirectness(base({ name: "Little Owl Coffee", distanceMiles: null, site: CAFE_SITE }));
    expect(unknown.reason).not.toMatch(/miles? away/);
    for (const r of [known.reason, unknown.reason]) expect(r).not.toMatch(/[—–→]/);
  });

  it("lowers a rival two price bands apart and lowers one far across town", () => {
    const same = scoreDirectness(base({ name: "A", distanceMiles: 5, site: CAFE_SITE })).directness;
    const pricey = scoreDirectness(
      base({ name: "A", distanceMiles: 5, site: { ...CAFE_SITE, priceBand: "$$$" } }),
    );
    const cheap = scoreDirectness({ ...base({ name: "A", distanceMiles: 5, site: { ...CAFE_SITE, priceBand: "$$$" } }), ownPriceBand: "$" });
    const far = scoreDirectness(base({ name: "A", distanceMiles: 9.5, site: CAFE_SITE })).directness;
    expect(pricey.reason).toContain("priced a step above you");
    expect(cheap.directness).toBeLessThan(same);
    expect(cheap.reason).toContain("very different price point");
    expect(far).toBeLessThan(same);
  });
});

describe("scoreDirectness for an online brand", () => {
  const SKIN_SERVICES = [
    { name: "Barrier Repair Serum", price_cents: 3800 },
    { name: "Ceramide Moisturizer", price_cents: 4200 },
  ];
  const SKIN_SITE: RivalSiteRead = {
    text: "Barrier repair serum and ceramide moisturizer for sensitive skin.",
    services: [
      { name: "Barrier Repair Serum", price: "36" },
      { name: "Ceramide Moisturizer", price: "40" },
      { name: "Hydrating Toner", price: "28" },
    ],
    priceBand: "$$",
    handles: {},
  };
  const online = (rival: DirectnessInput["rival"]): DirectnessInput => ({
    ownServices: SKIN_SERVICES,
    ownCategory: "Beauty & skincare",
    ownPriceBand: "$$",
    ownLexicon: [],
    ownMarket: "online",
    rival,
  });

  it("ignores distance entirely and names the live ad count", () => {
    const near = scoreDirectness(online({ name: "Real Skin", distanceMiles: 0.5, site: SKIN_SITE, activeMetaAds: 14 }));
    const far = scoreDirectness(online({ name: "Real Skin", distanceMiles: 2400, site: SKIN_SITE, activeMetaAds: 14 }));
    expect(near.directness).toBe(far.directness);
    expect(near.reason).toMatch(/^Sells barrier repair serum/);
    expect(near.reason).toContain("at your price point, and runs 14 Meta ads right now.");
    for (const r of [near.reason, far.reason]) {
      expect(r).not.toMatch(/miles? away|menu|[—–→]/);
    }
  });

  it("says nothing about ads when none are running, and never mentions distance when unread", () => {
    const quiet = scoreDirectness(online({ name: "Real Skin", site: SKIN_SITE, activeMetaAds: 0 }));
    expect(quiet.reason).not.toContain("Meta ad");
    const unread = scoreDirectness(online({ name: "Real Skin", distanceMiles: 1, site: null, activeMetaAds: 1 }));
    expect(unread.directness).toBeLessThanOrEqual(UNREAD_DIRECTNESS_CAP);
    expect(unread.reason).toContain("runs 1 Meta ad right now");
    expect(unread.reason).not.toMatch(/miles? away|Same category/);
  });
});

describe("orderByDirectness", () => {
  it("puts the most direct first and breaks near-ties by distance", () => {
    const ordered = orderByDirectness([
      { id: "diner", directness: 0.2, distanceMiles: 0.1 },
      { id: "far-cafe", directness: 0.81, distanceMiles: 6 },
      { id: "near-cafe", directness: 0.79, distanceMiles: 1 },
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["near-cafe", "far-cafe", "diner"]);
  });
});

const HOME = `<html><head><title>Little Owl Coffee</title></head><body>
  <nav><a href="/menu">Menu</a><a href="/about">About</a></nav>
  <p>Neighborhood espresso bar.</p>
  <footer><a href="https://instagram.com/littleowlcoffee">Instagram</a></footer>
</body></html>`;
const MENU = `<html><body><ul>
  <li>Cortado $4.50</li><li>Cappuccino $5.00</li><li>Cold Brew $5.00</li><li>Almond Croissant $4.75</li>
</ul><a href="https://www.tiktok.com/@littleowl">TikTok</a></body></html>`;

describe("readRivalSite", () => {
  it("reads the homepage and one menu page through the injected fetch", async () => {
    const asked: string[] = [];
    const read = await readRivalSite("littleowl.coffee", {
      fetchHtml: async (url) => {
        asked.push(url);
        if (url === "https://littleowl.coffee/") return HOME;
        if (url === "https://littleowl.coffee/menu") return MENU;
        throw new Error("404");
      },
    });
    expect(asked).toEqual(["https://littleowl.coffee/", "https://littleowl.coffee/menu"]);
    expect(read?.services.map((s) => s.name)).toEqual(["Cortado", "Cappuccino", "Cold Brew", "Almond Croissant"]);
    expect(read?.handles).toEqual({ instagram: "littleowlcoffee", tiktok: "littleowl" });
    expect(read?.text.length).toBeLessThanOrEqual(6000);
    expect(read?.text.indexOf("Cortado")).toBeLessThan(read?.text.indexOf("Neighborhood") ?? -1);
  });

  it("returns null instead of throwing when the site can't be read", async () => {
    expect(await readRivalSite("littleowl.coffee", { fetchHtml: () => Promise.reject(new Error("ECONNRESET")) })).toBeNull();
    expect(await readRivalSite("not a url", { fetchHtml: async () => HOME })).toBeNull();
  });
});

const BUSINESS: Business = {
  id: "biz-1",
  owner_id: "owner-1",
  name: "Bellwood Coffee",
  category: "Restaurants & cafés",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 10,
  website: "https://bellwood.coffee",
  price_band: "$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
  created_at: "2026-09-12T00:00:00Z",
};

const COMPETITOR: Competitor = {
  id: "comp-1",
  business_id: "biz-1",
  name: "Little Owl Coffee",
  website: "https://littleowl.coffee",
  place_id: null,
  social_handles: {},
  directness: null,
  directness_reason: null,
  created_at: "2026-09-12T00:00:00Z",
};

describe("enrichCompetitor", () => {
  it("stores handles and the directness verdict", async () => {
    const patches: Partial<NewCompetitor>[] = [];
    const repo = {
      updateCompetitor: async (id: string, patch: Partial<NewCompetitor>) => {
        patches.push(patch);
        return { ...COMPETITOR, id, ...patch } as Competitor;
      },
    } as unknown as Repo;
    const out = await enrichCompetitor(repo, BUSINESS, COMPETITOR, {
      ownServices: OWN_SERVICES,
      brief: null,
      fetchHtml: async (url) => (url.endsWith("/menu") ? MENU : HOME),
    });
    expect(patches).toHaveLength(1);
    expect(out.social_handles).toEqual({ instagram: "littleowlcoffee", tiktok: "littleowl" });
    expect(out.directness).toBeGreaterThan(UNREAD_DIRECTNESS_CAP);
    expect(out.directness_reason).toMatch(/^Sells the same /);
  });

  it("returns the competitor unchanged when the write fails", async () => {
    const repo = {
      updateCompetitor: async () => {
        throw new Error("db down");
      },
    } as unknown as Repo;
    const out = await enrichCompetitor(repo, BUSINESS, COMPETITOR, {
      ownServices: OWN_SERVICES,
      brief: null,
      fetchHtml: async () => HOME,
    });
    expect(out).toBe(COMPETITOR);
  });
});
