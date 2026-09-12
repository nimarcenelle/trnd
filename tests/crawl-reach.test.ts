import { describe, expect, it } from "vitest";

import {
  discoverInternalLinks,
  discoverMenuPdfs,
  discoverOffsiteMenu,
} from "../lib/import/website";
import type { Service, Signal } from "../lib/db/types";
import { matchService, scoreOpportunity, seriesIsSparse, THIN_VOLUME_GATE } from "../lib/scoring";

/**
 * Bellwood Coffee, Atlanta — a five-location café on Shopify whose import
 * came back as a bean-and-grinder web store. Each test here is one of the
 * reasons why, fixed.
 */

describe("a Shopify café's nav and menus", () => {
  it("does not let a policy page outrank the locations page", () => {
    const html = `
      <a href="/policies/terms-of-service">Terms of Service</a>
      <a href="/policies/refund-policy">Refund Policy</a>
      <a href="/cart">Cart</a>
      <a href="/search">Search</a>
      <a href="/pages/careers">Work With Us</a>
      <a href="/collections/coffee"><span><span>Coffee</span></span></a>
      <a href="https://bellwoodcoffee.com/pages/locations"><span class="menu-fx"><span>Locations</span><svg><path d="M0 0"/></svg></span></a>
      <a href="/pages/about">About</a>`;
    const links = discoverInternalLinks(html, "https://bellwoodcoffee.com/");
    expect(links[0]).toBe("https://bellwoodcoffee.com/pages/locations");
    expect(links.join(" ")).not.toMatch(/policies|cart|search|careers/);
    expect(links).toContain("https://bellwoodcoffee.com/pages/about");
  });

  it("reads a nav anchor whose body is wrapped in theme markup", () => {
    const wrapped = `<a href="/pages/locations" class="menu-item">${"<span>".repeat(20)}Locations${"</span>".repeat(20)}<svg viewBox="0 0 10 10"><path d="M1 1 L9 9 L1 9 Z"/></svg><span class="visually-hidden">${"x".repeat(200)}</span></a>`;
    expect(discoverInternalLinks(wrapped, "https://bellwoodcoffee.com/")).toEqual([
      "https://bellwoodcoffee.com/pages/locations",
    ]);
  });

  it("finds menu PDFs behind a cache-busting query string, full menus first", () => {
    const html = `
      <a href="https://cdn.shopify.com/s/files/1/0720/9199/2278/files/BWD_Menu_Decatur_SUMMER2026.pdf?v=1784582915">DECATUR MENU</a>
      <a href="https://cdn.shopify.com/s/files/1/0720/9199/2278/files/BWD_RiversideMenuFull_SUMMER2026.pdf?v=1784582956">RIVERSIDE MENU</a>
      <a href="https://cdn.shopify.com/s/files/1/0720/9199/2278/files/BWD_Peachforce_Menu_SPRING2025.pdf?v=1778170349">PEACHTREE MENU</a>`;
    const found = discoverMenuPdfs(html, "https://bellwoodcoffee.com/pages/locations");
    expect(found).toHaveLength(3);
    expect(found[0]).toMatch(/RiversideMenuFull/);
    expect(found[2]).toMatch(/SPRING2025/);
  });

  it("does not mistake a Square gift-card checkout for the menu", () => {
    const html = `<a href="https://app.squareup.com/gift/HNSH8PY1YZK41/order">Gift Cards</a>`;
    expect(discoverOffsiteMenu(html, "https://bellwoodcoffee.com/")).toBeNull();
    const real = `<a href="https://order.toasttab.com/online/bellwood">Order Online</a>`;
    expect(discoverOffsiteMenu(real, "https://bellwoodcoffee.com/")?.name).toBe("Toast");
  });
});

const service = (name: string, price = 500): Service =>
  ({ id: name, business_id: "b", name, description: null, price_cents: price, is_active: true, created_at: "" }) as unknown as Service;

const signal = (over: Partial<Signal> = {}): Signal =>
  ({
    id: "s1",
    source: "dataforseo",
    term: "light roast coffee beans",
    normalized_term: "light_roast_coffee_beans",
    category: "Restaurants & cafés",
    geo: "US-GA",
    metric_type: "search_volume",
    value: 5400,
    delta_pct: 0,
    window_days: 30,
    raw: null,
    captured_at: new Date().toISOString(),
    ...over,
  }) as unknown as Signal;

describe("matching a search to the menu", () => {
  it("prefers the item the shared words actually describe over the first one listed", () => {
    const menu = [
      service("Fellow Aiden Coffee Brewer", 39995),
      service("Drip Coffee", 350),
      service("The Wild Card light roast", 1800),
    ];
    expect(matchService(signal(), menu).service?.name).toBe("The Wild Card light roast");
    expect(matchService(signal({ term: "coffee near me" }), menu).service?.name).toBe("Drip Coffee");
  });

  it("weights a rare word over a word every item carries", () => {
    const menu = [service("Burundi Coffee"), service("Coffee Mug"), service("Coffee Tote")];
    expect(matchService(signal({ term: "burundi coffee beans" }), menu).service?.name).toBe("Burundi Coffee");
  });
});

describe("a mostly-zero daily series", () => {
  const spike = Array.from({ length: 30 }, (_, i) => ({ value: i === 26 ? 100 : 0 }));

  it("is sparse, and its one sampled day is not a 100% monthly climb", () => {
    expect(seriesIsSparse(spike)).toBe(true);
    const scored = scoreOpportunity(
      signal({ term: "anaerobic natural coffee", value: 110, delta_pct: 0 }),
      [service("Colombia Anaerobic Natural", 3000)],
      [],
      { coverageCount: null },
      { series: spike, locality: "state" },
    );
    expect(scored.sparse).toBe(true);
    expect(scored.monthPct).toBeNull();
    expect(scored.rationale).not.toMatch(/up 100% across 30 days/);
    expect(scored.rationale).toMatch(/too small for Google's daily meter/);
  });

  it("keeps a delta another source measured, gated", () => {
    const scored = scoreOpportunity(
      signal({ term: "burundi coffee beans", value: 110, delta_pct: 27 }),
      [service("Burundi Ruvumu Natural", 2500)],
      [],
      { coverageCount: null },
      { series: spike, locality: "state" },
    );
    expect(scored.weekPct).toBe(27);
    expect(scored.evidenceGate).toBeLessThan(1);
  });
});

describe("a search volume too small to advertise into", () => {
  it("is held below a flat term with real volume", () => {
    const menu = [service("Burundi Ruvumu Natural", 2500), service("Light Roast Blend", 1900)];
    const tiny = scoreOpportunity(
      signal({ term: "burundi coffee beans", value: 110, delta_pct: 27 }),
      menu,
      [],
      { coverageCount: null },
      { locality: "state" },
    );
    const real = scoreOpportunity(
      signal({ term: "light roast coffee beans", value: 5400, delta_pct: 0 }),
      menu,
      [],
      { coverageCount: null },
      { locality: "state" },
    );
    expect(tiny.thinVolume).toBe(true);
    expect(tiny.evidenceGate).toBe(THIN_VOLUME_GATE);
    expect(tiny.rationale).toMatch(/about 110 searches a month/);
    expect(real.thinVolume).toBeFalsy();
    expect(real.score).toBeGreaterThan(tiny.score);
  });
});

describe("one series, one quantity", () => {
  it("keeps the daily index when monthly volumes were stamped under the same key", async () => {
    const { indexSeries } = await import("../lib/demand/series");
    const mixed = [
      ...Array.from({ length: 28 }, (_, i) => ({ day: `d${i}`, value: 20 + (i % 5) })),
      { day: "m1", value: 14800 },
      { day: "m2", value: 14800 },
    ];
    expect(indexSeries(mixed)).toHaveLength(28);
    expect(indexSeries(mixed.slice(0, 28))).toHaveLength(28);
    expect(indexSeries(mixed.slice(28))).toHaveLength(2);
  });

  it("caps a month read that starts from nothing", async () => {
    const { trendPct, TREND_PCT_CAP } = await import("../lib/scoring");
    const fromZero = [
      ...Array.from({ length: 7 }, () => ({ value: 0.001 })),
      ...Array.from({ length: 21 }, () => ({ value: 40 })),
    ];
    expect(trendPct(fromZero)).toBe(TREND_PCT_CAP);
  });

  it("a size in parentheses does not push the plain item behind a subscription", () => {
    const menu = [
      service("The Traditionalist Coffee Subscription", 1900),
      service("Drip Coffee (Small)", 350),
    ];
    expect(matchService(signal({ term: "coffee near me" }), menu).service?.name).toBe("Drip Coffee (Small)");
  });
});

describe("a parenthetical that names the thing", () => {
  it("still counts for the match", () => {
    const menu = [service("Espresso", 375), service("Sprotini (Espresso Martini)", 1500)];
    expect(matchService(signal({ term: "espresso martini atlanta" }), menu).service?.name).toBe(
      "Sprotini (Espresso Martini)",
    );
  });
});
