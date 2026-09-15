import { describe, expect, it } from "vitest";

import type { Competitor, CompetitorRead, Opportunity, Signal } from "../lib/db/types";
import { BASELINE_FEATURES, PLAN_PRICES, PLAN_PRICES_ANNUAL } from "../lib/billing";
import { isSelf, pickRivals } from "../lib/intel/seed-competitors";
import type { DiscoveredPlace } from "../lib/prospect/discover";
import { previousWeek, rankingChanges, rivalChanges } from "../lib/recommend/diff";
import { forecastFlight, forecastLine, parseDailyRange } from "../lib/recommend/forecast";

const place = (over: Partial<DiscoveredPlace>): DiscoveredPlace => ({
  placeId: over.name ?? "p",
  name: "Shop",
  category: "Bicycle shop",
  address: null,
  city: "New York",
  region: "NY",
  phone: null,
  website: null,
  rating: 4.5,
  reviewCount: 100,
  distanceMiles: 1,
  businessStatus: "OPERATIONAL",
  ...over,
});

describe("rival seeding", () => {
  const me = { name: "Bicycle Habitat", website: "bicyclehabitat.com" };

  it("drops the business itself by name or domain", () => {
    expect(isSelf(place({ name: "Bicycle Habitat Chelsea" }), me)).toBe(true);
    expect(isSelf(place({ name: "Some Other Shop", website: "https://www.bicyclehabitat.com/soho" }), me)).toBe(true);
    expect(isSelf(place({ name: "Bike Bros" }), me)).toBe(false);
  });

  it("skips closed listings and chains, dedupes, and takes the nearest five", () => {
    const places = [
      place({ name: "Bicycle Habitat", distanceMiles: 0 }),
      place({ name: "Trek Bicycle Store Manhattan", distanceMiles: 0.3 }),
      place({ name: "Closed Cycles", distanceMiles: 0.4, businessStatus: "CLOSED_PERMANENTLY" }),
      place({ name: "Walmart", distanceMiles: 0.5 }),
      place({ name: "Bike Bros", distanceMiles: 0.6 }),
      place({ name: "Bike Bros", placeId: "dupe", distanceMiles: 0.7 }),
      place({ name: "Wrench and Roll", distanceMiles: 1.1 }),
      place({ name: "Chelsea Cycles", distanceMiles: 1.4 }),
      place({ name: "Park Slope Bikes", distanceMiles: 2 }),
      place({ name: "Far Away Cycles", distanceMiles: 8 }),
    ];
    const picked = pickRivals(places, me);
    expect(picked.map((p) => p.name)).toEqual([
      "Trek Bicycle Store Manhattan",
      "Bike Bros",
      "Wrench and Roll",
      "Chelsea Cycles",
      "Park Slope Bikes",
    ]);
  });

  it("never re-adds a rival the owner already watches", () => {
    const existing = [{ name: "Bike Bros", place_id: null }] as Competitor[];
    const picked = pickRivals([place({ name: "Bike Bros" }), place({ name: "Chelsea Cycles" })], me, existing, 1);
    expect(picked.map((p) => p.name)).toEqual(["Chelsea Cycles"]);
  });
});

describe("flight forecast", () => {
  it("turns a daily budget into clicks and bookings the owner can picture, labeled as an estimate", () => {
    expect(parseDailyRange("$25–50")).toEqual([25, 50]);
    const f = forecastFlight({ daily: "$25–50", category: "Retail & boutiques" });
    expect(f.spend).toEqual([150, 300]);
    expect(f.clicks[1]).toBeGreaterThan(f.clicks[0]);
    expect(f.bookings[0]).toBeGreaterThanOrEqual(1);
    const line = forecastLine(f);
    expect(line).toMatch(/^About [\d,–]+ clicks and [\d–]+ bookings for \$150–300 over 6 days/);
    expect(line).toMatch(/estimate/);
  });
});

describe("what changed since last week", () => {
  const opp = (id: string, score: number): Opportunity =>
    ({ id, signal_id: id, score, status: "new", week_of: "2026-09-07" }) as unknown as Opportunity;
  const sig = (term: string): Signal => ({ normalized_term: term.replace(/ /g, "_"), term }) as unknown as Signal;

  it("says nothing in week one", () => {
    expect(rankingChanges([{ opportunity: opp("a", 7), signal: sig("bike tune up") }], [])).toEqual([]);
    expect(previousWeek("2026-09-07")).toBe("2026-08-31");
  });

  it("names new terms, grade moves, and drop-outs", () => {
    const now = [
      { opportunity: opp("a", 8.2), signal: sig("bike tune up") },
      { opportunity: opp("b", 6.5), signal: sig("cargo bike assembly") },
    ];
    const then = [
      { opportunity: opp("a0", 6.5), signal: sig("bike tune up") },
      { opportunity: opp("c0", 6), signal: sig("flat tire repair") },
    ];
    const lines = rankingChanges(now, then).map((l) => l.text);
    expect(lines).toContain("“bike tune up” moved B → A.");
    expect(lines).toContain("New this week: “cargo bike assembly” (B).");
    expect(lines).toContain("“flat tire repair” fell out of the ranking.");
  });

  it("reports a rival whose ad count moved", () => {
    const rival = { id: "r1", name: "Bike Bros" } as Competitor;
    const read = (value: number, daysAgo: number): CompetitorRead =>
      ({ competitor_id: "r1", kind: "ads", value, captured_at: new Date(Date.now() - daysAgo * 86400_000).toISOString() }) as unknown as CompetitorRead;
    expect(rivalChanges([rival], [read(7, 0), read(2, 7)])[0].text).toBe("Bike Bros added 5 Meta ads this week (2 → 7).");
    expect(rivalChanges([rival], [read(3, 0), read(2, 7)])).toEqual([]);
  });
});

describe("pricing", () => {
  it("sells one plan at $500, and everything is in it", () => {
    expect(PLAN_PRICES.baseline).toBe("$500/mo");
    expect(PLAN_PRICES_ANNUAL.baseline).toBe("$5,000/yr");
    // The pro id still exists for old subscriptions but never prints a
    // second price anywhere.
    expect(PLAN_PRICES.pro).toBe(PLAN_PRICES.baseline);
    // The briefs, the evidence with its limits, the competitors read, the
    // brand's own results and the founder review all ride on the one plan,
    // and none of it promises a winner.
    expect(BASELINE_FEATURES.some((f) => /creative test briefs/.test(f))).toBe(true);
    expect(BASELINE_FEATURES.some((f) => /competitors/.test(f))).toBe(true);
    expect(BASELINE_FEATURES.some((f) => /cannot say/.test(f))).toBe(true);
    expect(BASELINE_FEATURES.some((f) => /founder reads/.test(f))).toBe(true);
    for (const f of BASELINE_FEATURES) expect(f).not.toMatch(/—|→|near(est)? you|local|winner|guarantee|hit rate/i);
  });
});
