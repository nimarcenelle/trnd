import { describe, expect, it } from "vitest";

import { discoverMenuFiles, discoverMenuImages, discoverMenuSubpages, menuFileName } from "../lib/import/website";

const HUB = "https://www.example-diner.com/menu";

describe("finding the menus a menu page links to", () => {
  it("follows the breakfast, lunch and drinks buttons on a hub page", () => {
    const html = `
      <nav><a href="/">Home</a><a href="/about">About</a><a href="/menu">Menu</a></nav>
      <div class="buttons">
        <a href="/menu/breakfast"><span><span>Breakfast</span></span></a>
        <a href="/lunch-dinner">Lunch &amp; Dinner</a>
        <a class="btn" href="/p/2931"><span>Drinks</span></a>
        <a href="https://www.toasttab.com/example-diner">Order online</a>
        <a href="/contact">Contact</a>
      </div>`;
    expect(discoverMenuSubpages(html, HUB)).toEqual([
      "https://www.example-diner.com/menu/breakfast",
      "https://www.example-diner.com/lunch-dinner",
      "https://www.example-diner.com/p/2931",
    ]);
  });

  it("skips files and the hub itself", () => {
    const html = `<a href="/menu">Menu</a><a href="/s/menu.pdf">Menu PDF</a><a href="/menu/#top">Top</a>`;
    expect(discoverMenuSubpages(html, HUB)).toEqual([]);
  });
});

describe("finding a menu posted as a picture", () => {
  it("takes images that say menu, not photos of the food", () => {
    const html = `
      <img src="/images/burger-hero.jpg" alt="Our famous burger">
      <img src="/uploads/Dinner-Menu-2026.jpg" alt="">
      <img data-src="https://cdn.example.com/a8f3.png" src="data:image/gif;base64,AAA" alt="Drinks menu">`;
    expect(discoverMenuImages(html, HUB)).toEqual([
      "https://www.example-diner.com/uploads/Dinner-Menu-2026.jpg",
      "https://cdn.example.com/a8f3.png",
    ]);
  });
});

describe("the menu files a whole crawl turned up", () => {
  it("puts PDFs before images and never reads the same file twice", () => {
    const pages = [
      { url: "https://www.example-diner.com/", html: `<a href="/s/menu.pdf">Menu</a>` },
      {
        url: HUB,
        html: `<img src="/img/menu-board.jpg"><a href="/s/menu.pdf">Menu</a><a href="/s/drinks-menu.pdf">Drinks</a>`,
      },
    ];
    expect(discoverMenuFiles(pages)).toEqual([
      "https://www.example-diner.com/s/menu.pdf",
      "https://www.example-diner.com/s/drinks-menu.pdf",
      "https://www.example-diner.com/img/menu-board.jpg",
    ]);
  });

  it("names a file the way the owner would recognize it", () => {
    expect(menuFileName("https://static1.squarespace.com/t/1/fall+2026+brunch+menu_+CCS.pdf")).toBe("fall 2026 brunch menu_ CCS.pdf");
  });
});
