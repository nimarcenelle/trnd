import { describe, expect, it } from "vitest";

import { discoverMenuPdfs } from "../lib/import/website";

const BASE = "https://www.carolinacoffeeshop.com/carolina-coffee-shop-menu";

describe("finding a priced menu that lives in a PDF", () => {
  it("finds the menus Squarespace wraps in image anchors", () => {
    // The real markup: the href sits alone on its own line inside an <a>
    // whose content runs hundreds of characters before the closing tag, so
    // matching <a>…</a> as a pair missed both of these.
    const html = `
      <div class="slide"><div class="margin-wrapper">
        <a

            href="/s/CCS-coffee-desserts-menu-Dec22.pdf"

          aria-label=""
          class="image-slide-anchor content-fill"
        ><img src="x.jpg" alt=""/><div class="a-lot-of-markup"></div></a>
        <a href="/s/fall-2026-brunch-menu_-CCS.pdf"><img src="y.jpg"/></a>
      </div></div>`;
    expect(discoverMenuPdfs(html, BASE)).toEqual([
      // Newest first: a year in the filename is the only ordering signal
      // these files reliably carry.
      "https://www.carolinacoffeeshop.com/s/fall-2026-brunch-menu_-CCS.pdf",
      "https://www.carolinacoffeeshop.com/s/CCS-coffee-desserts-menu-Dec22.pdf",
    ]);
  });

  it("uses nearby text when the filename says nothing", () => {
    const html = `<a href="/files/final-v3.pdf">Download our full menu</a>`;
    expect(discoverMenuPdfs(html, BASE)).toHaveLength(1);
  });

  it("leaves PDFs that are not menus alone", () => {
    const html = `
      <a href="/s/press-release-2026.pdf">Press</a>
      <a href="/s/franchise-application.pdf">Apply</a>`;
    expect(discoverMenuPdfs(html, BASE)).toEqual([]);
  });

  it("does not wander off to another site", () => {
    const html = `<a href="https://example.com/their-menu.pdf">Menu</a>`;
    const found = discoverMenuPdfs(html, BASE);
    // Absolute URLs are kept as given — the caller fetches them — but this
    // records that a cross-site menu link is discovered, not silently
    // rewritten onto our own host.
    expect(found).toEqual(["https://example.com/their-menu.pdf"]);
  });

  it("never returns the same menu twice", () => {
    const html = `
      <a href="/s/menu.pdf">Menu</a>
      <a href="/s/menu.pdf?v=2">Menu</a>`;
    expect(discoverMenuPdfs(html, BASE)).toHaveLength(1);
  });
});
