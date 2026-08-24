import { describe, expect, it } from "vitest";

import { extractFromHtml, normalizeUrl } from "../lib/import/website";

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
