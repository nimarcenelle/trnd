import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  discoverInternalLinks,
  extractFromHtml,
  extractFromPages,
  inferPriceBand,
  looksBlocked,
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

  it("decodes HTML entities in names pulled from JSON-LD and titles", () => {
    const html = `<script type="application/ld+json">{"@type":"Restaurant","name":"Tupelo Honey Kitchen &amp; Bar","address":{"addressLocality":"Asheville","addressRegion":"NC"}}</script>`;
    expect(extractFromHtml(html).name).toBe("Tupelo Honey Kitchen & Bar");
    expect(decodeEntities("Caf&eacute; &#39;76 &amp; Co&#x2019;s")).toBe("Café '76 & Co’s");
  });

  it("accepts any LocalBusiness subtype and reads priceRange as the band", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"FoodEstablishment","name":"Ember","priceRange":"$$$","address":{"addressLocality":"Austin","addressRegion":"TX"}}]}</script>`;
    const out = extractFromHtml(html);
    expect(out.name).toBe("Ember");
    expect(out.city).toBe("Austin");
    expect(out.priceBand).toBe("$$$");
  });

  it("pulls priced offerings out of JSON-LD menus and products, filtering storefront junk", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Restaurant","name":"Noa","hasMenu":{"@type":"Menu","hasMenuSection":{"@type":"MenuSection","hasMenuItem":[
        {"@type":"MenuItem","name":"Shakshuka","offers":{"@type":"Offer","price":"14"}},
        {"@type":"MenuItem","name":"Gift Card","offers":{"@type":"Offer","price":"50"}}
      ]}}}
    </script>
    <script type="application/ld+json">{"@type":"Product","name":"House Blend Beans","offers":[{"@type":"Offer","price":18.5}]}</script>`;
    const out = extractFromHtml(html);
    const names = out.services.map((s) => s.name);
    expect(names).toContain("Shakshuka");
    expect(names).toContain("House Blend Beans");
    expect(out.services.find((s) => s.name === "House Blend Beans")?.price).toBe("18.5");
    expect(names.join(" ")).not.toMatch(/Gift Card/);
  });

  it("skips storefront price chrome in text lines", () => {
    const html = `<p>Sale price: $55</p><p>Original price: $64</p><p>Fade Cut — $38</p>`;
    const names = extractFromHtml(html).services.map((s) => s.name);
    expect(names).toEqual(["Fade Cut"]);
  });

  it("votes the category across keyword counts instead of first match", () => {
    // One generic nav "menu" must not beat a page full of sauna language.
    const html = `<p>Menu</p><p>Private infrared sauna and cold plunge studio. Book your sauna session. Contrast therapy for recovery.</p>`;
    expect(extractFromHtml(html).category).toBe("Health & beauty");
  });

  it("recognizes bot-protection interstitials", () => {
    expect(looksBlocked(`<title>Attention Required! | Cloudflare</title><p>captcha</p>`)).toBe(true);
    expect(looksBlocked(`<title>Just a moment...</title><p>Verify you are human</p>`)).toBe(true);
    expect(looksBlocked(CAFE_HTML)).toBe(false);
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
