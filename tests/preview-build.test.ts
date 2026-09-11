import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SnapshotEvent } from "../lib/preview/types";

/**
 * The assembly, with the network stubbed: a real crawl can't run in CI (or
 * in the sandbox — see BLOCKED.md), but the orchestration is the risky part
 * and it is pure sequencing over the adapters.
 */

const corpus = {
  pages: [{ url: "https://glow.example/", html: "<html></html>" }],
  text: "Glow Studio — Atlanta",
};

const siteImport = {
  name: "Glow Studio",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  services: [
    { name: "Brow Lamination", price: "95" },
    { name: "Hydrafacial", price: "180" },
  ],
  priceBand: "$$",
  photos: [],
};

vi.mock("@/lib/import/website", () => ({
  fetchSiteCorpus: vi.fn(async () => corpus),
  extractFromPages: vi.fn(() => ({ ...siteImport })),
  inferPriceBand: vi.fn(() => "$$"),
  probeStorefrontProducts: vi.fn(async () => []),
}));

const trendsSignal = {
  source: "google_trends" as const,
  term: "brow lamination",
  category: "Health & beauty",
  geo: "US-GA-524",
  metric_type: "search_interest",
  value: 64,
  delta_pct: 34,
  window_days: 7,
  raw: {},
};

vi.mock("@/lib/signals/adapters/trends-iot", () => ({
  createTrendsIotAdapter: () => ({
    name: "google_trends_iot",
    isAvailable: async () => true,
    fetch: async () => [trendsSignal],
  }),
}));

vi.mock("@/lib/signals/adapters/suggest", () => ({
  createSuggestAdapter: () => ({
    name: "google_suggest",
    isAvailable: async () => true,
    fetch: async () => [
      {
        source: "google_suggest" as const,
        term: "hydrafacial",
        category: "Health & beauty",
        geo: "US-GA-524",
        metric_type: "search_intent",
        value: 4,
        delta_pct: null,
        window_days: 1,
        raw: { suggestions: ["hydrafacial near me", "hydrafacial cost"] },
      },
    ],
  }),
}));

vi.mock("@/lib/signals/adlibrary", () => ({
  createMetaAdsAdapter: () => ({
    name: "meta_ads",
    isAvailable: async () => true,
    fetch: async () => [
      {
        source: "meta_ads" as const,
        term: "brow lamination",
        category: "Health & beauty",
        geo: "US-GA-524",
        metric_type: "ad_saturation",
        value: 3,
        delta_pct: null,
        window_days: 7,
        raw: { ads: [{ advertiser: "Lash Bar ATL", snippet: "Brows that last 8 weeks — $89" }] },
      },
    ],
  }),
}));

const { buildDemandSnapshot } = await import("../lib/preview/build");

describe("demand snapshot assembly", () => {
  let events: SnapshotEvent[] = [];
  beforeEach(() => {
    events = [];
  });

  it("reads a site and builds the whole snapshot", async () => {
    const built = await buildDemandSnapshot("https://glow.example/", (e) => events.push(e));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { snapshot } = built;

    // Their own site, read once — the offer is written against this list.
    expect(snapshot.business.name).toBe("Glow Studio");
    expect(snapshot.business.services.map((s) => s.name)).toContain("Brow Lamination");

    // Demand measured where they are, not nationally.
    expect(snapshot.metroLabel).toMatch(/Atlanta/);
    const lead = snapshot.demand.find((d) => d.term === "brow lamination");
    expect(lead?.deltaPct).toBe(34);
    expect(lead?.measured).toBe(true);
    expect(lead?.url).toContain("trends.google.com");

    // Intent reads are kept, and honestly marked as not a measurement.
    expect(snapshot.demand.find((d) => d.term === "hydrafacial")?.measured).toBe(false);

    // What rivals are actually saying, not just how many there are.
    expect(snapshot.competition[0]?.activeAds).toBe(3);
    expect(snapshot.competition[0]?.sample).toMatch(/8 weeks/);

    // The ad leads with the strongest measured term and names their service.
    expect(snapshot.ad?.term).toBe("brow lamination");
    expect(snapshot.ad?.hook.length ?? 0).toBeGreaterThan(8);
    expect(snapshot.ad?.service).toBe("Brow Lamination");
    expect(snapshot.quiet).toEqual([]);
  });

  it("streams findings as they land, not just at the end", async () => {
    await buildDemandSnapshot("https://glow.example/", (e) => events.push(e));
    const findings = events.filter((e) => e.type === "finding");
    // Site, place, demand, competition, calendar — the wait is the product.
    expect(findings.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(findings.map((f) => (f.type === "finding" ? f.finding.kind : "")));
    expect(kinds.has("site")).toBe(true);
    expect(kinds.has("demand")).toBe(true);
    expect(kinds.has("competition")).toBe(true);
    // Every finding arrives before the build returns, in pipeline order.
    const first = findings[0];
    expect(first.type === "finding" && first.finding.kind).toBe("site");
    expect(
      findings.some(
        (f) => f.type === "finding" && /up 34% this week/.test(f.finding.headline),
      ),
    ).toBe(true);
  });

  it("refuses a page it can't read a business out of", async () => {
    const website = await import("@/lib/import/website");
    vi.mocked(website.extractFromPages).mockReturnValueOnce({ services: [] });
    const built = await buildDemandSnapshot("https://nothing.example/", (e) => events.push(e));
    expect(built.ok).toBe(false);
  });
});
