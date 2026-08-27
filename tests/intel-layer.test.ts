import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-intel-layer-"));
process.env.META_APP_SECRET = "test-secret";
process.env.META_APP_ID = "test-app";

import { evaluateAlerts } from "../lib/alerts/engine";
import { parseInsights, signOauthState, verifyOauthState, buildAdSetPayload } from "../lib/ads/meta";
import { createDemoRepo } from "../lib/db/demo/repo";
import { resetStore } from "../lib/db/demo/store";
import type { Business, Campaign, NewBusiness } from "../lib/db/types";
import { buildFallbackReviewDigest } from "../lib/reviews/digest";
import { deltaFromMonthly, mapDfsRow } from "../lib/signals/adapters/dataforseo";

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Sweathouz",
  category: "Health & beauty",
  city: "Chapel Hill",
  region: "NC",
  country: "US",
  lat: 35.91,
  lng: -79.05,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
});

describe("meta ads pure helpers", () => {
  it("round-trips the signed OAuth state and rejects tampering", () => {
    const state = signOauthState("biz-123");
    expect(verifyOauthState(state)).toBe("biz-123");
    expect(verifyOauthState(`biz-456.${state.split(".")[1]}`)).toBeNull();
    expect(verifyOauthState(null)).toBeNull();
  });

  it("parses insights rows including conversions and revenue", () => {
    const row = parseInsights({
      impressions: "12000",
      clicks: "240",
      spend: "85.50",
      actions: [
        { action_type: "purchase", value: "6" },
        { action_type: "lead", value: "3" },
        { action_type: "post_engagement", value: "99" },
      ],
      action_values: [{ action_type: "purchase", value: "420.00" }],
    });
    expect(row).toEqual({
      impressions: 12000,
      clicks: 240,
      spend_cents: 8550,
      bookings: 9,
      revenue_cents: 42000,
    });
  });

  it("targets a radius around the business when coordinates exist", () => {
    const business = { lat: 35.9, lng: -79.0, radius_miles: 20 } as unknown as Business;
    const campaign = {
      hook: "Recover in private",
      audience: { who: "Athletes", radius_miles: 15 },
    } as unknown as Campaign;
    const payload = buildAdSetPayload(business, campaign, "123", 2500);
    const targeting = JSON.parse(payload.targeting) as {
      geo_locations: { custom_locations: { radius: number }[] };
    };
    expect(targeting.geo_locations.custom_locations[0].radius).toBe(15);
    expect(payload.status).toBe("PAUSED");
    expect(payload.daily_budget).toBe("2500");
  });
});

describe("dataforseo mapping", () => {
  const monthly = [
    { year: 2026, month: 6, search_volume: 800 },
    { year: 2026, month: 7, search_volume: 1000 },
  ];

  it("computes month-over-month delta", () => {
    expect(deltaFromMonthly(monthly)).toBe(25);
    expect(deltaFromMonthly([])).toBeNull();
  });

  it("maps a result row to a search_volume signal with series", () => {
    const { signal, series } = mapDfsRow(
      { keyword: "cold plunge chapel hill", search_volume: 1000, monthly_searches: monthly },
      "Health & beauty",
      "US-NC",
      30,
    );
    expect(signal).toMatchObject({
      source: "dataforseo",
      metric_type: "search_volume",
      value: 1000,
      delta_pct: 25,
    });
    expect(series).toHaveLength(2);
    expect(series[0].day).toBe("2026-06-01");
  });
});

describe("review digest fallback", () => {
  it("mines themes and quotable hooks without a model", () => {
    const business = { id: "b1" } as unknown as Business;
    const mk = (rating: number, text: string, i: number) => ({
      id: `r${i}`,
      business_id: "b1",
      competitor_id: null,
      author: `A${i}`,
      rating,
      text,
      published_at: null,
      source: "google" as const,
      captured_at: "2026-08-26T00:00:00Z",
    });
    const digest = buildFallbackReviewDigest(business, [
      mk(5, "The private suite was spotless and the private plunge was amazing", 1),
      mk(5, "Loved the private suite, super clean and never crowded", 2),
      mk(2, "Booking was confusing and the schedule kept changing", 3),
    ]);
    expect(digest.review_count).toBe(3);
    expect(digest.themes.join(" ")).toContain("private");
    expect(digest.copy_hooks.length).toBeGreaterThan(0);
    expect(digest.watchouts.join(" ")).toContain("booking");
  });
});

describe("alerts engine", () => {
  beforeEach(() => resetStore());

  async function seed() {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "u1" });
    const biz = await user.createBusiness(bizInput("u1"));
    await user.upsertBusinessBrief({
      business_id: biz.id,
      positioning: "p",
      customer_segments: ["s"],
      market_context: "m",
      pricing_read: "p",
      seasonality: "s",
      does_well: ["d"],
      moat: "m",
      advantages: ["a"],
      watchouts: ["w"],
      first_moves: ["f"],
      watch_terms: ["cold plunge chapel hill"],
      model_used: "test",
      prompt_version: "brief-4",
    });
    await admin.upsertSignals([
      {
        source: "tiktok",
        term: "cold plunge recovery",
        normalized_term: "cold_plunge_recovery",
        category: biz.category,
        geo: "US",
        metric_type: "conversation",
        value: null,
        delta_pct: 64,
        window_days: 7,
        raw: {},
      },
    ]);
    const rival = await user.createCompetitor({
      business_id: biz.id,
      name: "Rival Recovery",
      website: null,
      place_id: null,
    });
    await user.upsertCompetitorReads([
      {
        competitor_id: rival.id,
        business_id: biz.id,
        kind: "ads",
        value: 4,
        rating: null,
        summary: "4 active Meta ads",
        raw: {},
      },
    ]);
    return { user, biz };
  }

  it("raises spike and competitor alerts, and never duplicates on re-run", async () => {
    const { user, biz } = await seed();
    const first = await evaluateAlerts(user, biz);
    const kinds = first.map((a) => a.kind);
    expect(kinds).toContain("demand_spike");
    expect(kinds).toContain("competitor_ads");

    const second = await evaluateAlerts(user, biz);
    expect(second).toHaveLength(0);

    const unread = await user.listAlerts(biz.id, { unreadOnly: true });
    expect(unread.length).toBe(first.length);
    await user.markAlertsRead(biz.id);
    expect(await user.listAlerts(biz.id, { unreadOnly: true })).toHaveLength(0);
  });

  it("keeps alerts owner-scoped", async () => {
    const { user, biz } = await seed();
    await evaluateAlerts(user, biz);
    const stranger = createDemoRepo({ kind: "user", userId: "u2" });
    expect(await stranger.listAlerts(biz.id)).toEqual([]);
  });
});

describe("coreTerm widening", () => {
  it("strips locality tokens and known qualifiers", async () => {
    const { coreTerm } = await import("../lib/signals/adapters/trends-iot");
    expect(coreTerm("cold plunge nyc", ["new", "york", "ny"])).toBe("cold plunge");
    expect(coreTerm("banya near me", [])).toBe("banya");
    expect(coreTerm("contrast therapy new york", ["new", "york", "ny"])).toBe("contrast therapy");
    expect(coreTerm("hammam scrub chapel hill", ["chapel", "hill", "nc"])).toBe("hammam scrub");
  });

  it("drops an unrecognized trailing qualifier, and leaves short terms alone", async () => {
    const { coreTerm } = await import("../lib/signals/adapters/trends-iot");
    expect(coreTerm("sports massage flatiron", ["new", "york", "ny"])).toBe("sports massage");
    expect(coreTerm("sauna and steam room", [])).toBe("sauna and steam");
    expect(coreTerm("cold plunge", [])).toBe("cold plunge");
  });
});
