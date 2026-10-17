import { describe, expect, it } from "vitest";

import { bestIcon } from "@/lib/logo";

describe("bestIcon", () => {
  it("prefers the apple touch icon, then the largest, resolving relative links", () => {
    const html = `<link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="icon" href="//cdn.shop.com/fav-96.png?v=1&amp;w=96" sizes="96x96">
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
      <link rel="stylesheet" href="/style.css">`;
    expect(bestIcon(html, "https://slap.art/")).toBe("https://slap.art/apple-touch-icon.png");
    expect(bestIcon(html.replace(/<link rel="apple-touch-icon"[^>]*>/, ""), "https://slap.art/")).toBe("https://cdn.shop.com/fav-96.png?v=1&w=96");
    expect(bestIcon("<link rel=stylesheet href=x.css>", "https://slap.art/")).toBeNull();
  });
});
