import { describe, expect, it } from "vitest";

import {
  cleanSocialHandles,
  extractSocialHandles,
  handleUrl,
  poolSocialHandles,
} from "../lib/import/social-links";
import { extractFromPages } from "../lib/import/website";

const FOOTER = `
<footer>
  <a href="https://www.instagram.com/BellwoodCoffee/" aria-label="Instagram"><svg></svg></a>
  <a href="https://www.tiktok.com/@bellwoodcoffee?lang=en">TikTok</a>
  <a href="https://facebook.com/bellwoodcoffee">Facebook</a>
</footer>`;

describe("extractSocialHandles", () => {
  it("reads all three platforms from a footer, lowercased", () => {
    expect(extractSocialHandles(FOOTER)).toEqual({
      instagram: "bellwoodcoffee",
      tiktok: "bellwoodcoffee",
      facebook: "bellwoodcoffee",
    });
  });

  it("ignores share buttons, posts, pixels and non-profile paths", () => {
    const html = `
      <a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fbellwood.coffee">Share</a>
      <a href="https://www.facebook.com/dialog/share?app_id=1">Share</a>
      <noscript><img src="https://www.facebook.com/tr?id=123&ev=PageView&noscript=1"></noscript>
      <html xmlns:fb="http://www.facebook.com/2008/fbml">
      <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/C8xYz12/"></blockquote>
      <a href="https://www.instagram.com/reel/abc123/">Reel</a>
      <a href="https://www.instagram.com/explore/tags/latte/">Tag</a>
      <a href="https://www.tiktok.com/@bellwood/video/7312345678">A video</a>
      <a href="https://www.tiktok.com/tag/coffee">Tag</a>
      <a href="https://www.facebook.com/profile.php?id=10009">Profile</a>
      <a href="https://www.facebook.com/events/12345/">Event</a>
      <a href="https://developers.facebook.com/docs">Docs</a>`;
    expect(extractSocialHandles(html)).toEqual({});
  });

  it("lets the most frequently linked handle win on a platform", () => {
    const html = `
      <header><a href="https://instagram.com/bellwoodcoffee">IG</a></header>
      <p>Beans roasted by <a href="https://instagram.com/partnerroasters">our friends</a></p>
      <footer><a href="https://www.instagram.com/bellwoodcoffee/">IG</a></footer>`;
    expect(extractSocialHandles(html).instagram).toBe("bellwoodcoffee");
  });

  it("requires the @ form on TikTok, encoded or not", () => {
    expect(extractSocialHandles(`<a href="https://tiktok.com/bellwood">x</a>`)).toEqual({});
    expect(extractSocialHandles(`<a href="https://www.tiktok.com/%40Bellwood.Coffee">x</a>`)).toEqual({
      tiktok: "bellwood.coffee",
    });
  });

  it("reads bare fb.com and m.facebook.com links", () => {
    expect(extractSocialHandles(`<a href="fb.com/bellwoodcoffee">f</a>`)).toEqual({ facebook: "bellwoodcoffee" });
    expect(extractSocialHandles(`<a href="https://m.facebook.com/bellwood-atl/?ref=page">f</a>`)).toEqual({
      facebook: "bellwood-atl",
    });
  });

  it("reads escaped JSON links from theme settings", () => {
    expect(extractSocialHandles(`{"instagram":"https:\\/\\/www.instagram.com\\/bellwoodcoffee"}`)).toEqual({
      instagram: "bellwoodcoffee",
    });
  });

  it("rejects the platforms' own accounts", () => {
    const html = `
      <a href="https://www.instagram.com/instagram/">Seen on Instagram</a>
      <a href="https://www.facebook.com/facebook">Facebook</a>
      <a href="https://www.tiktok.com/@tiktok">TikTok</a>`;
    expect(extractSocialHandles(html)).toEqual({});
  });

  it("rejects handles longer than 40 characters", () => {
    expect(extractSocialHandles(`<a href="https://instagram.com/${"a".repeat(41)}">x</a>`)).toEqual({});
  });
});

describe("poolSocialHandles", () => {
  it("counts every page, so the handle repeated across the site wins", () => {
    const pages = [
      { url: "https://bellwood.coffee/", html: `<a href="https://instagram.com/eventpartner">partner</a>` },
      { url: "https://bellwood.coffee/menu", html: `<a href="https://instagram.com/bellwoodcoffee">IG</a>` },
      {
        url: "https://bellwood.coffee/locations",
        html: `<a href="https://instagram.com/bellwoodcoffee">IG</a><a href="https://www.tiktok.com/@bellwoodatl">TT</a>`,
      },
    ];
    expect(poolSocialHandles(pages)).toEqual({ instagram: "bellwoodcoffee", tiktok: "bellwoodatl" });
  });

  it("feeds extractFromPages as SiteImport.social", () => {
    const data = extractFromPages([{ url: "https://bellwood.coffee/", html: `<title>Bellwood Coffee</title>${FOOTER}` }]);
    expect(data.social).toEqual({ instagram: "bellwoodcoffee", tiktok: "bellwoodcoffee", facebook: "bellwoodcoffee" });
    const none = extractFromPages([{ url: "https://bellwood.coffee/", html: "<title>Bellwood Coffee</title>" }]);
    expect(none.social).toBeUndefined();
  });
});

describe("handleUrl and cleanSocialHandles", () => {
  it("builds canonical profile URLs", () => {
    expect(handleUrl("instagram", "bellwoodcoffee")).toBe("https://www.instagram.com/bellwoodcoffee/");
    expect(handleUrl("tiktok", "bellwoodcoffee")).toBe("https://www.tiktok.com/@bellwoodcoffee");
    expect(handleUrl("facebook", "bellwoodcoffee")).toBe("https://www.facebook.com/bellwoodcoffee");
  });

  it("keeps only the three platforms with well-formed handles", () => {
    expect(
      cleanSocialHandles({ instagram: "@BellwoodCoffee", tiktok: "bad handle!", twitter: "x", facebook: 5 }),
    ).toEqual({ instagram: "bellwoodcoffee" });
    expect(cleanSocialHandles(["instagram"])).toEqual({});
    expect(cleanSocialHandles(null)).toEqual({});
  });
});
