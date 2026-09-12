import { describe, expect, it } from "vitest";

import { buildAdSetPayload } from "../lib/ads/meta";
import type { Business, Campaign } from "../lib/db/types";
import { suggestStandingQuestions } from "../lib/intel/standing";
import { isOnlineBusiness, NATIONWIDE_RADIUS, placeLabel, placeWords } from "../lib/signals/geo";

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

const campaign = {
  id: "c1",
  opportunity_id: "o1",
  business_id: "b1",
  angle: "a",
  hook: "h",
  offer: "o",
  audience: { who: "people with hard water", age_range: "25-44", radius_miles: NATIONWIDE_RADIUS, interests: [], why: "w" },
  channel: "meta",
  status: "draft",
  external_id: null,
  external_status: null,
  model_used: "m",
  prompt_version: "p",
  created_at: new Date().toISOString(),
} as Campaign;

describe("an online DTC brand's location is not a factor", () => {
  it("has no place words and reads as the US", () => {
    expect(isOnlineBusiness(business())).toBe(true);
    expect(placeWords(business())).toEqual([]);
    expect(placeLabel(business())).toBe("the US");
    expect(placeWords(business({ market: "local" }))).toEqual(["Irvine", "CA"]);
    expect(placeLabel(business({ market: "local" }))).toBe("Irvine, CA");
  });

  it("launches Meta ads to the whole US even when coordinates exist", () => {
    // Meta takes targeting as a JSON string inside the form payload.
    const targetingOf = (payload: Record<string, string>) =>
      Object.values(payload)
        .map((v) => {
          try {
            return JSON.parse(v) as { geo_locations?: { countries?: string[]; custom_locations?: unknown[] } };
          } catch {
            return null;
          }
        })
        .find((o) => o && typeof o === "object" && "geo_locations" in o)?.geo_locations;
    const online = targetingOf(buildAdSetPayload(business(), campaign, "123", 5000));
    expect(online?.countries).toEqual(["US"]);
    expect(online?.custom_locations).toBeUndefined();
    const local = targetingOf(
      buildAdSetPayload(business({ market: "local" }), { ...campaign, audience: { ...campaign.audience, radius_miles: 20 } }, "123", 5000),
    );
    expect(local?.custom_locations).toHaveLength(1);
  });

  it("asks about price against competing brands, not a city", () => {
    const services = [{ id: "s1", business_id: "b1", name: "Filtered Showerhead", description: null, price_cents: 14900, is_active: true }];
    const online = suggestStandingQuestions(business(), services, null);
    expect(online.join(" ")).toContain("priced right against competing brands");
    expect(online.join(" ")).not.toContain("Irvine");
    expect(suggestStandingQuestions(business({ market: "local" }), services, null).join(" ")).toContain("for Irvine");
  });
});
