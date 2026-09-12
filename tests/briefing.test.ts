import { describe, expect, it } from "vitest";

import { BRIEFING_SLOTS, buildBriefing, type BriefingInput } from "../lib/recommend/briefing";
import type { BusinessBrief, Service } from "../lib/db/types";

const brief = (over: Partial<BusinessBrief> = {}): BusinessBrief =>
  ({
    id: "b", business_id: "x", positioning: "", market_context: "",
    pricing_read: "Your prices sit mid-market for Atlanta. Lead with the intro session.",
    seasonality: "Demand peaks in January and again after Labor Day. Use the dip to build list.",
    customer_segments: ["Desk workers in their 30s who lift and want recovery, not a spa day"],
    does_well: [], moat: "Only contrast therapy suite inside the perimeter.",
    advantages: ["Walkable", "Only contrast therapy suite inside the perimeter with a cold plunge"],
    watchouts: ["Never imply medical outcomes", "Avoid before-and-after skin photos in ads"],
    first_moves: [], watch_terms: [], lexicon: [], subreddits: [],
    model_used: "", prompt_version: "", created_at: "",
    ...over,
  }) as BusinessBrief;

const service = (price_cents: number | null): Service => ({
  id: "s", business_id: "x", name: "contrast therapy session",
  description: null, price_cents, is_active: true,
});

const base: BriefingInput = {
  brief: brief(), matchedService: null, signal: null,
  adCount: null, adAdvertisers: [], moment: null, city: "Atlanta",
};

describe("pick briefing", () => {
  it("keeps the same slots in the same order every week", () => {
    const rows = buildBriefing({ ...base, adCount: 4, adAdvertisers: ["Sweat ATL"] });
    const order = rows.map((r) => r.slot);
    const expected = BRIEFING_SLOTS.filter((s) => order.includes(s));
    expect(order).toEqual(expected);
  });

  it("omits a slot rather than filling it with hedging", () => {
    const rows = buildBriefing({ ...base, brief: null });
    // Nothing real behind any brief-derived slot — they simply do not appear.
    expect(rows.map((r) => r.slot)).not.toContain("WHO");
    expect(rows.map((r) => r.slot)).not.toContain("NEVER");
  });

  it("leads the anchor with a real price when the pick matched a service", () => {
    const rows = buildBriefing({ ...base, matchedService: service(4500) });
    expect(rows.find((r) => r.slot === "ANCHOR")?.text).toContain("$45");
    // Whole dollars are written as an offer, not an invoice.
    expect(rows.find((r) => r.slot === "ANCHOR")?.text).not.toContain("$45.00");
  });

  it("falls back to the pricing read when no service matched", () => {
    const rows = buildBriefing(base);
    expect(rows.find((r) => r.slot === "ANCHOR")?.text).toContain("mid-market");
  });

  it("says the field is open rather than reporting zero rivals", () => {
    const rows = buildBriefing({ ...base, adCount: 0 });
    expect(rows.find((r) => r.slot === "RIVALS")?.text).toMatch(/field is open/);
  });

  it("refuses to describe the local field from a national keyword flood", () => {
    const rows = buildBriefing({ ...base, adCount: 900 });
    expect(rows.find((r) => r.slot === "RIVALS")?.text).toMatch(/unknown/);
    expect(rows.find((r) => r.slot === "RIVALS")?.text).not.toMatch(/900/);
  });

  it("prefers a dated moment over a season for WHEN", () => {
    const rows = buildBriefing({ ...base, moment: { label: "New year recovery rush", when: "starts Jan 2" } });
    expect(rows.find((r) => r.slot === "WHEN")?.text).toContain("starts Jan 2");
  });

  it("never repeats the NEVER line in WATCH-OUT", () => {
    const rows = buildBriefing(base);
    const never = rows.find((r) => r.slot === "NEVER")?.text;
    const watch = rows.find((r) => r.slot === "WATCH-OUT")?.text;
    expect(never).toBeTruthy();
    expect(watch).toBeTruthy();
    expect(watch).not.toBe(never);
  });

  it("drops WATCH-OUT entirely when the brief named only one risk", () => {
    const rows = buildBriefing({ ...base, brief: brief({ watchouts: ["Never imply medical outcomes"] }) });
    expect(rows.map((r) => r.slot)).toContain("NEVER");
    expect(rows.map((r) => r.slot)).not.toContain("WATCH-OUT");
  });

  it("leads EDGE with the substantive advantage, not the one-word one", () => {
    const rows = buildBriefing(base);
    expect(rows.find((r) => r.slot === "EDGE")?.text).toContain("contrast therapy suite");
  });
});
