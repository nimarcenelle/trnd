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
});
