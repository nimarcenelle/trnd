import { describe, expect, it } from "vitest";

import { generateFallbackCampaign } from "../lib/ai/fallback";
import { GenerationSchema } from "../lib/ai/schemas";
import type { Business, Opportunity, Service, Signal } from "../lib/db/types";

/**
 * Copy that runs past Meta's limits is not richer — it is cut off
 * mid-thought in the only place anyone reads it. A headline clips near 40
 * characters, primary text hides past ~125 behind "See more", and the offer
 * is set over the photo, where a paragraph became white wallpaper across
 * the image in a real generation.
 */
const business = {
  id: "b", owner_id: "o",
  // Deliberately long: a long business or service name must shorten the
  // line, not push it past the cut.
  name: "Caffe Driade Espresso Bar, Wine Bar & Teahouse",
  category: "espresso bar, wine bar & teahouse",
  city: "Chapel Hill", region: "NC", country: "US",
  lat: null, lng: null, radius_miles: 20, website: null, price_band: "mid",
  brand_voice_notes: null, photo_urls: [], social_handles: {}, created_at: new Date().toISOString(),
} as Business;

const signal = {
  id: "s", source: "google_trends", term: "handcrafted espresso and ice cream milkshakes",
  normalized_term: "handcrafted_espresso", category: "Restaurants & cafés", geo: "US-NC",
  metric_type: "search_interest", value: 61, delta_pct: 24, window_days: 7,
  captured_at: new Date().toISOString(), raw: null,
} as Signal;

const opportunity = {
  id: "op", business_id: "b", signal_id: "s", week_of: "2026-09-07", score: 7.2,
  rationale: "", matched_service_id: null, competitor_gap: null, relevance: 1,
  status: "new", created_at: new Date().toISOString(),
} as Opportunity;

const service: Service = {
  id: "sv", business_id: "b", name: "Driade Shake with handcrafted espresso and ice cream",
  description: null, price_cents: 850, is_active: true,
};

describe("ad copy stays inside the limits it is read at", () => {
  const out = generateFallbackCampaign({ business, signal, opportunity, service });

  it("produces copy the schema accepts", () => {
    expect(() => GenerationSchema.parse(out)).not.toThrow();
  });

  it("keeps every headline short enough not to be clipped", () => {
    for (const h of out.assets.headlines) {
      expect(h.length, `headline too long: "${h}"`).toBeLessThanOrEqual(40);
    }
  });

  it("keeps primary text inside the See-more cut", () => {
    for (const p of out.assets.primary_texts) {
      expect(p.length, `primary text too long: "${p}"`).toBeLessThanOrEqual(125);
    }
  });

  it("keeps the offer short enough to sit over a photo", () => {
    expect(out.angle.offer.length).toBeLessThanOrEqual(90);
  });

  it("never ends a clamped line on a dangling separator", () => {
    for (const line of [...out.assets.headlines, ...out.assets.primary_texts]) {
      expect(line).not.toMatch(/[\s,;:—-]$/);
    }
  });

  it("still says something — clamping must not empty a line", () => {
    for (const line of [...out.assets.headlines, ...out.assets.primary_texts]) {
      expect(line.trim().length).toBeGreaterThan(3);
    }
  });
});
