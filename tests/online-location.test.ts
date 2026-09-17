import { describe, expect, it } from "vitest";

import type { Business } from "../lib/db/types";
import { isOnlineBusiness, placeLabel, placeWords } from "../lib/signals/geo";

const business = (over: Partial<Business> = {}): Business => ({
  id: "b1",
  owner_id: "u1",
  name: "eskiin",
  category: "Beauty & wellness",
  city: "Irvine",
  region: "CA",
  country: "US",
  lat: 33.68,
  lng: -117.83,
  radius_miles: 20,
  website: "https://eskiin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "online",
  monthly_ad_spend: "50-100k",
  ad_platforms: ["meta"],
  created_at: new Date().toISOString(),
  ...over,
});

describe("an online DTC brand's location is not a factor", () => {
  it("has no place words and reads as the US", () => {
    expect(isOnlineBusiness(business())).toBe(true);
    expect(placeWords(business())).toEqual([]);
    expect(placeLabel(business())).toBe("the US");
    expect(placeWords(business({ market: "local" }))).toEqual(["Irvine", "CA"]);
    expect(placeLabel(business({ market: "local" }))).toBe("Irvine, CA");
  });
});
