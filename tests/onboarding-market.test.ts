import { describe, expect, it } from "vitest";

import { extractFromPages } from "../lib/import/website";
import { decideMarket, hasStreetAddress, parseMarketProfile } from "../lib/onboarding/market";

describe("market decision", () => {
  it("reads a storefront with no address as an online brand", () => {
    expect(decideMarket({ storefront: true, streetAddress: false, category: "Beauty & skincare" })).toBe("online");
  });

  it("reads a street address and a place-like category as local", () => {
    expect(decideMarket({ storefront: false, streetAddress: true, category: "Restaurants & cafés" })).toBe("local");
    expect(decideMarket({ storefront: false, streetAddress: true, category: "Hair salon" })).toBe("local");
    expect(decideMarket({ storefront: false, streetAddress: true, category: "Fitness studios" })).toBe("local");
    expect(decideMarket({ storefront: false, streetAddress: true, category: "Retail & boutiques" })).toBe("local");
  });

  it("keeps a café local even when it ships beans from a Shopify store", () => {
    expect(decideMarket({ storefront: true, streetAddress: true, category: "Restaurants & cafés" })).toBe("local");
  });

  it("keeps a storefront brand online when its category only says shop or beauty", () => {
    expect(decideMarket({ storefront: true, streetAddress: true, category: "Retail & boutiques" })).toBe("online");
    expect(decideMarket({ storefront: true, streetAddress: true, category: "Health & beauty" })).toBe("online");
  });

  it("defaults to online when there is neither an address nor a place", () => {
    expect(decideMarket({ storefront: false, streetAddress: false })).toBe("online");
    expect(decideMarket({ storefront: false, streetAddress: true, category: "Wellness & supplements" })).toBe("online");
  });

  it("spots a written street address, not marketing copy", () => {
    expect(hasStreetAddress("Visit us at 412 Franklin Street, Chapel Hill, NC")).toBe(true);
    expect(hasStreetAddress("40 W 25th St, New York")).toBe(true);
    expect(hasStreetAddress("Free shipping over 50 dollars, the easy way")).toBe(false);
  });
});

describe("market from the site import", () => {
  it("reads a Shopify brand with no address as online", () => {
    const html = `<html><head><title>Glow Lab | Clean skincare</title>
      <link rel="stylesheet" href="//glowlab.com/cdn/shop/t/2/assets/theme.css"></head>
      <body><h1>Serums for sensitive skin</h1><p>Skincare that ships free.</p></body></html>`;
    expect(extractFromPages([{ url: "https://glowlab.com/", html }]).market).toBe("online");
  });

  it("reads a café with a JSON-LD street address as local", () => {
    const html = `<html><head><title>Noa Cafe</title>
      <script type="application/ld+json">{"@type":"CafeOrCoffeeShop","name":"Noa Cafe","address":{"streetAddress":"12 Avenue A","addressLocality":"New York","addressRegion":"NY"}}</script>
      </head><body><h1>Coffee and brunch</h1><p>Espresso, matcha, cafe menu.</p></body></html>`;
    expect(extractFromPages([{ url: "https://noacafe.com/", html }]).market).toBe("local");
  });
});

describe("market profile validation", () => {
  it("accepts allowed values and stores platforms in list order", () => {
    expect(
      parseMarketProfile({ market: "online", spend: "50-100k", platforms: ["tiktok", "meta", "tiktok", ""] }),
    ).toEqual({ profile: { market: "online", monthly_ad_spend: "50-100k", ad_platforms: ["meta", "tiktok"] } });
  });

  it("treats a blank spend as not given and a missing market as the fallback", () => {
    expect(parseMarketProfile({ market: null, spend: "", platforms: [] })).toEqual({
      profile: { market: "local", monthly_ad_spend: null, ad_platforms: [] },
    });
    expect(parseMarketProfile({ market: "", spend: null, platforms: [] }, "online")).toEqual({
      profile: { market: "online", monthly_ad_spend: null, ad_platforms: [] },
    });
  });

  it("refuses values the controls never offer", () => {
    expect(parseMarketProfile({ market: "global", spend: "", platforms: [] })).toHaveProperty("error");
    expect(parseMarketProfile({ market: "online", spend: "1m-plus", platforms: [] })).toHaveProperty("error");
    expect(parseMarketProfile({ market: "online", spend: "", platforms: ["myspace"] })).toHaveProperty("error");
  });
});
