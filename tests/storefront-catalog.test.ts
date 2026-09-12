import { describe, expect, it } from "vitest";

import {
  asCatalog,
  fetchStorefrontCatalog,
  fillCatalogPrices,
  linkedProductHandles,
  matchCatalog,
  shopifyCatalog,
} from "../lib/import/catalog";
import { extractFromHtml } from "../lib/import/website";

// Trimmed from eskiin.com/products.json (2026-09-12): the store whose import
// came back with seven products and no prices.
const tiers = (base: number[]) =>
  ["Chrome", "Black"].flatMap((finish) =>
    ["Basic", "Double", "Triple", "Family"].map((tier, i) => ({ title: `${finish} / ${tier}`, price: base[i].toFixed(2) })),
  );
const ESKIIN = {
  products: [
    { title: "Gold Filtered Handheld Showerhead", handle: "gold-filtered-handheld-showerhead", variants: [{ title: "Default Title", price: "169.00" }] },
    { title: "Filtered Handheld Showerhead V2", handle: "filtered-handheld-showerhead-v2-3", variants: [{ title: "Chrome", price: "169.00" }, { title: "Black", price: "169.00" }] },
    { title: "Filtered Handheld Showerhead V2", handle: "filtered-handheld-showerhead-v2-1", variants: [{ title: "Chrome", price: "169.00" }] },
    { title: "eskiin Filtered Showerhead", handle: "eskiin-filtered-showerhead-4", variants: [{ title: "Chrome", price: "149.00" }] },
    { title: "eskiin Replacement Filter", handle: "eskiin-replacement-filter-1", variants: [{ title: "Default Title", price: "36.00" }] },
    { title: "Handheld Filter Replacement V2", handle: "handheld-filter-replacement-v2-2", variants: [{ title: "Default Title", price: "49.00" }] },
    { title: "eskiin Filtered Handheld Showerhead Bundle - 1.8 GPM", handle: "eskiin-filtered-handheld-showerhead-bundle-1-8-gpm", variants: tiers([237, 442, 616, 758]) },
    { title: "eskiin Filtered Showerhead Bundle - 1.8 GPM", handle: "eskiin-filtered-showerhead-bundles-1-8-gpm", variants: tiers([192, 360, 500, 616]) },
    { title: "eskiin Wallmount - 1.8 GPM", handle: "eskiin-wallmount-1-8-gpm", variants: [{ title: "Chrome", price: "149.00" }] },
    { title: "Shipping Protection", handle: "shipping-protection", variants: [{ title: "Default Title", price: "3.99" }] },
    { title: "eskiin Gift Card", handle: "gift-card", variants: [{ title: "$50", price: "50.00" }] },
    { title: "FREE Beauty And Wellness E-Book", handle: "ebook", variants: [{ title: "Default Title", price: "16.00" }] },
  ],
};
const catalog = shopifyCatalog(ESKIIN);
const opts = { brand: "eskiin" };

describe("a Shopify catalog", () => {
  it("keeps products with their priced tiers, drops what nobody buys as a product, and folds re-listings", () => {
    expect(catalog.map((p) => p.name)).toEqual([
      "Gold Filtered Handheld Showerhead",
      "Filtered Handheld Showerhead V2",
      "eskiin Filtered Showerhead",
      "eskiin Replacement Filter",
      "Handheld Filter Replacement V2",
      "eskiin Filtered Handheld Showerhead Bundle - 1.8 GPM",
      "eskiin Filtered Showerhead Bundle - 1.8 GPM",
      "eskiin Wallmount - 1.8 GPM",
    ]);
    const bundle = catalog.find((p) => p.handle === "eskiin-filtered-showerhead-bundles-1-8-gpm")!;
    expect(bundle.price).toBe("192");
    expect(bundle.variants.find((v) => v.label === "Double")?.price).toBe("360");
  });

  it("returns nothing for a response that isn't a catalog", () => {
    expect(shopifyCatalog("<!DOCTYPE html>")).toEqual([]);
    expect(shopifyCatalog({ products: "nope" })).toEqual([]);
  });
});

describe("pricing the names the site uses", () => {
  const priceOf = (name: string, o = opts) => matchCatalog(name, catalog, o)?.price ?? null;

  it("prices the names from eskiin's import that had none", () => {
    expect(priceOf("Handheld Filtered Showerhead")).toBe("169");
    expect(priceOf("Handheld Filter Replacement")).toBe("49");
    expect(priceOf("Wall Mount Filter Replacement")).toBe("36");
  });

  it("prices a bundle tier from the tier's own variant", () => {
    expect(priceOf("Double Bundle (2 Showerheads + 6 Replacement Filters)")).toBe("360");
    expect(priceOf("Triple Bundle (3 Showerheads + 9 Replacement Filters)")).toBe("500");
    expect(priceOf("Family Bundle (4 Showerheads + 12 Replacement Filters)")).toBe("616");
  });

  it("lets the product the site's pages link to win a close call", () => {
    const linked = { brand: "eskiin", linkedHandles: new Set(["eskiin-filtered-handheld-showerhead-bundle-1-8-gpm"]) };
    expect(priceOf("Double Bundle (2 Showerheads + 6 Replacement Filters)", linked)).toBe("442");
  });

  it("leaves a price empty rather than guess one the catalog doesn't hold", () => {
    expect(priceOf("Limited-Edition Gold Wall Mount Showerhead")).toBeNull();
    expect(priceOf("Shower Steamers")).toBeNull();
  });
});

describe("filling an import's rows", () => {
  it("keeps prices already found, fills the rest, and adds priced products nobody named", () => {
    const rows = fillCatalogPrices(
      [
        { name: "Handheld Filtered Showerhead", price: "" },
        { name: "Handheld Filter Replacement", price: "45" },
        { name: "Limited-Edition Gold Wall Mount Showerhead", price: "" },
      ],
      catalog,
      { ...opts, append: 2 },
    );
    expect(rows.slice(0, 3)).toEqual([
      { name: "Handheld Filtered Showerhead", price: "169" },
      { name: "Handheld Filter Replacement", price: "45" },
      { name: "Limited-Edition Gold Wall Mount Showerhead", price: "" },
    ]);
    expect(rows).toHaveLength(5);
    expect(rows.slice(3).every((r) => r.price !== "")).toBe(true);
  });

  it("prices names from a crawl's flat list too", () => {
    const crawl = asCatalog([{ name: "The Jolie Filtered Showerhead", price: "169" }, { name: "FREE", price: "" }]);
    expect(fillCatalogPrices([{ name: "Jolie Filtered Showerhead" }], crawl, { brand: "jolie" })).toEqual([
      { name: "Jolie Filtered Showerhead", price: "169" },
    ]);
  });

  it("finds the product pages a site links to", () => {
    expect([...linkedProductHandles([{ html: '<a href="/products/eskiin-wallmount-1-8-gpm?variant=1">' }])]).toEqual([
      "eskiin-wallmount-1-8-gpm",
    ]);
  });

  it("reads the catalog through the store's own JSON, and tolerates a blocked read", async () => {
    const ok = await fetchStorefrontCatalog("https://eskiin.com/pages/sp6", '<script src="//cdn.shopify.com/x.js">', {
      fetchJson: async () => ESKIIN,
    });
    expect(ok.length).toBe(8);
    const blocked = await fetchStorefrontCatalog("https://jolieskinco.com", '<script src="//cdn.shopify.com/x.js">', {
      fetchJson: async () => {
        throw new Error("catalog 403");
      },
    });
    expect(blocked).toEqual([]);
  });
});

describe("price lines that aren't products", () => {
  it("drops FREE, a bare price, 'you save', and a sentence cut off before its price", () => {
    const html = [
      "FREE $16",
      "$99 $132",
      "You save $33",
      "Filters delivered every 90 days for $33",
      "Handheld Showerhead $169",
    ]
      .map((l) => `<p>${l}</p>`)
      .join("");
    expect(extractFromHtml(`<html><body>${html}</body></html>`).services).toEqual([{ name: "Handheld Showerhead", price: "169" }]);
  });
});
