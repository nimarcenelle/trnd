import { describe, expect, it } from "vitest";

import { buildFallbackBrief } from "../lib/ai/brief";
import type { Business, Service } from "../lib/db/types";

const biz = (over: Partial<Business> = {}): Business => ({
  id: "b1",
  owner_id: "u1",
  name: "Noa",
  category: "Restaurants & cafés",
  city: "New York",
  region: "NY",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: "noaacafe.com",
  price_band: "$$",
  brand_voice_notes: "Warm neighborhood cafe.",
  created_at: "",
  ...over,
});
const svc = (name: string, cents: number): Service => ({
  id: name,
  business_id: "b1",
  name,
  description: null,
  price_cents: cents,
  is_active: true,
});

describe("business brief fallback", () => {
  it("builds a complete, business-specific brief", () => {
    const brief = buildFallbackBrief(biz(), [svc("Matcha drinks", 700), svc("Iced lattes", 600)]);
    expect(brief.does_well.length).toBeGreaterThanOrEqual(2);
    expect(brief.does_well.join(" ")).toContain("Matcha drinks");
    expect(brief.does_well.join(" ")).toContain("New York");
    expect(brief.moat.length).toBeGreaterThan(20);
    expect(brief.advantages.length).toBeGreaterThanOrEqual(2);
    expect(brief.watchouts.length).toBeGreaterThanOrEqual(2);
  });

  it("gives category-specific watchouts", () => {
    const cafe = buildFallbackBrief(biz(), []);
    const spa = buildFallbackBrief(biz({ category: "Health & beauty" }), []);
    expect(cafe.watchouts.join(" ")).toMatch(/deal hunters|rush/);
    expect(spa.watchouts.join(" ")).toMatch(/before\/after|medical/);
    expect(cafe.watchouts).not.toEqual(spa.watchouts);
  });

  it("fills the full analysis: positioning, segments, market, pricing, seasonality, first moves", () => {
    const brief = buildFallbackBrief(biz(), [svc("Matcha drinks", 700), svc("Iced lattes", 600)]);
    expect(brief.positioning).toContain("Noa");
    expect(brief.positioning).toContain("New York");
    expect(brief.customer_segments.length).toBeGreaterThanOrEqual(2);
    expect(brief.market_context.length).toBeGreaterThan(40);
    expect(brief.seasonality.length).toBeGreaterThan(40);
    expect(brief.first_moves.length).toBeGreaterThanOrEqual(2);
    expect(brief.first_moves.join(" ")).toContain("Matcha drinks");
  });

  it("grounds the pricing read in real prices, and asks for prices when missing", () => {
    const priced = buildFallbackBrief(biz(), [svc("Espresso", 450), svc("Brunch plate", 2400)]);
    expect(priced.pricing_read).toContain("$4.50");
    expect(priced.pricing_read).toContain("$24");
    const unpriced = buildFallbackBrief(biz(), []);
    expect(unpriced.pricing_read).toMatch(/No prices/);
  });

  it("differs by category across the analysis sections", () => {
    const cafe = buildFallbackBrief(biz(), []);
    const gym = buildFallbackBrief(biz({ category: "Fitness studios" }), []);
    expect(cafe.market_context).not.toEqual(gym.market_context);
    expect(cafe.seasonality).not.toEqual(gym.seasonality);
    expect(cafe.customer_segments).not.toEqual(gym.customer_segments);
  });
});
