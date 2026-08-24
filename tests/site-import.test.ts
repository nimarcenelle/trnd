import { describe, expect, it } from "vitest";

import {
  discoverInternalLinks,
  extractFromHtml,
  extractFromPages,
  inferPriceBand,
  normalizeUrl,
} from "../lib/import/website";

const CAFE_HTML = `
<html><head>
<title>Noa Cafe | Matcha &amp; Coffee in NYC</title>
<meta name="description" content="A warm neighborhood cafe in the East Village. Matcha, espresso, and weekend brunch.">
<script type="application/ld+json">
{"@type":"CafeOrCoffeeShop","name":"Noa Cafe","address":{"addressLocality":"New York","addressRegion":"NY"},"description":"Neighborhood cafe. Simple, honest."}
</script>
</head><body>
<h1>Menu</h1>
<ul>
<li>Iced Matcha Latte ..... $7</li>
<li>Espresso ... $4.50</li>
<li>Oat Milk Latte — $6</li>
<li>Weekend Brunch Plate · $24</li>
<li>Delivery fee $3</li>
</ul>
<p>Visit us in New York, NY. Best coffee and matcha in the East Village.</p>
</body></html>`;

describe("website import extractor", () => {
  it("normalizes URLs", () => {
    expect(normalizeUrl("noaacafe.com")).toBe("https://noaacafe.com/");
    expect(normalizeUrl("https://noaacafe.com/menu")).toBe("https://noaacafe.com/menu");
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("reads name and location from JSON-LD", () => {
    const out = extractFromHtml(CAFE_HTML);
    expect(out.name).toBe("Noa Cafe");
    expect(out.city).toBe("New York");
    expect(out.region).toBe("NY");
  });

  it("extracts priced offerings and skips fees", () => {
    const out = extractFromHtml(CAFE_HTML);
    const names = out.services.map((s) => s.name);
    expect(names).toContain("Iced Matcha Latte");
    expect(names).toContain("Weekend Brunch Plate");
    expect(out.services.find((s) => s.name === "Espresso")?.price).toBe("4.50");
    expect(names.join(" ")).not.toMatch(/Delivery fee/);
  });

  it("classifies the category from page language", () => {
    expect(extractFromHtml(CAFE_HTML).category).toBe("Restaurants & cafés");
  });

  it("falls back to <title> when there is no JSON-LD", () => {
    const html = `<title>Glow Aesthetics Studio – Botox &amp; Facials in Atlanta, GA</title><p>Facial balancing $99</p><p>Atlanta, GA</p>`;
    const out = extractFromHtml(html);
    expect(out.name).toBe("Glow Aesthetics Studio");
    expect(out.category).toBe("Health & beauty");
    expect(out.city).toBe("Atlanta");
  });
});

describe("site crawl", () => {
  it("discovers menu/pricing/about links on the same host, menus first", () => {
    const html = `
      <a href="/menu">Menu</a>
      <a href="/about-us">About</a>
      <a href="https://instagram.com/noa">Instagram</a>
      <a href="/menu.pdf">PDF menu</a>
      <a href="/pricing">Pricing</a>
      <a href="/careers">Careers</a>
      <a href="/menu">Menu again</a>`;
    const links = discoverInternalLinks(html, "https://noaacafe.com/");
    expect(links[0]).toBe("https://noaacafe.com/menu");
    expect(links).toContain("https://noaacafe.com/pricing");
    expect(links).toContain("https://noaacafe.com/about-us");
    expect(links.join(" ")).not.toMatch(/instagram|pdf|careers/);
    expect(new Set(links).size).toBe(links.length);
  });

  it("pools priced offerings across pages and infers a price band", () => {
    const menuHtml = `<ul><li>Iced Matcha Latte ..... $7</li><li>Weekend Brunch Plate · $24</li><li>Espresso ... $4.50</li></ul>`;
    const out = extractFromPages([
      { url: "https://noaacafe.com/", html: CAFE_HTML },
      { url: "https://noaacafe.com/menu", html: menuHtml },
    ]);
    // Dedupes against the homepage's items instead of doubling them.
    expect(out.services.filter((s) => s.name === "Espresso")).toHaveLength(1);
    expect(out.priceBand).toBe("$");
  });

  it("infers price band from median price per category", () => {
    const cheap = [{ name: "Drip", price: "3" }, { name: "Latte", price: "5" }];
    const premium = [{ name: "Tasting menu", price: "95" }, { name: "Pairing", price: "60" }];
    expect(inferPriceBand(cheap, "Restaurants & cafés")).toBe("$");
    expect(inferPriceBand(premium, "Restaurants & cafés")).toBe("$$$");
    expect(inferPriceBand(premium, undefined)).toBeUndefined();
    expect(inferPriceBand([], "Restaurants & cafés")).toBeUndefined();
  });
});
