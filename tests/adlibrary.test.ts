import { describe, expect, it } from "vitest";

import { parseAdLibrary } from "../lib/signals/adlibrary";
import { competitorGap } from "../lib/scoring";
import { upcomingMoments } from "../lib/recommend/seasonal";
import { extractImageUrls } from "../lib/import/website";

// Trimmed from a live render of the Ad Library search page (Aug 2026).
const FIXTURE = `
Terms
Cookies
~180 results
These results include ads that match your keyword search.
Filters
Active
Library ID: 4436837456590744
Started running on Aug 6, 2026
Platforms
See ad details
The Atlanta Journal-Constitution Sponsored
Jones said anyone with concerns about a med spa practicing outside their scope should file a complaint with the board.
Stay up-to-date with the AJC
Learn More
Active
Library ID: 1478008150532215
Started running on Apr 27, 2026
See ad details
VC Esthetics MedSpa Sponsored
Want a more defined, balanced profile?
This advanced facial balancing treatment uses filler to enhance areas like the chin, jawline, and cheeks.
FB.ME
Facial Balancing $949
Book now
`;

describe("meta ad library parser", () => {
  it("reads the total and per-ad advertiser + copy", () => {
    const read = parseAdLibrary(FIXTURE);
    expect(read.total).toBe(180);
    expect(read.ads.length).toBe(2);
    expect(read.ads[0].advertiser).toBe("The Atlanta Journal-Constitution");
    expect(read.ads[1].advertiser).toBe("VC Esthetics MedSpa");
    expect(read.ads[1].snippet).toContain("facial balancing treatment");
    // Copy stops at the display-domain line, never leaks CTA chrome.
    expect(read.ads[1].snippet).not.toContain("FB.ME");
    expect(read.ads[0].snippet).not.toContain("Learn More");
  });

  it("returns null-ish on a wall page", () => {
    const read = parseAdLibrary("Log in to Facebook\nSee more");
    expect(read.total).toBeNull();
    expect(read.ads).toEqual([]);
  });
});

describe("competitor gap with real ad counts", () => {
  it("prefers the Meta count over the news proxy and scales sensibly", () => {
    const low = competitorGap({ coverageCount: 14, adCount: 3 });
    expect(low.score).toBeGreaterThan(0.9);
    expect(low.reason).toContain("3 competitor ads");
    const high = competitorGap({ coverageCount: null, adCount: 180 });
    expect(high.score).toBe(0);
    expect(high.reason).toContain("crowded field");
  });
});

describe("seasonal calendar", () => {
  it("returns upcoming moments inside the horizon, soonest first, with prep flags", () => {
    // Late August: Labor Day (Sep 7) is ~2 weeks out for restaurants.
    const late_aug = new Date(Date.UTC(2026, 7, 25));
    const ups = upcomingMoments("Restaurants & cafés", late_aug);
    expect(ups.length).toBeGreaterThan(0);
    expect(ups[0].label).toContain("Labor Day");
    expect(ups[0].prepNow).toBe(true);
    expect(ups.map((u) => u.daysOut)).toEqual([...ups.map((u) => u.daysOut)].sort((a, b) => a - b));
  });

  it("wraps into next year for moments already past", () => {
    const december = new Date(Date.UTC(2026, 11, 20));
    const ups = upcomingMoments("Fitness studios", december);
    expect(ups[0].label).toContain("New Year");
  });
});

describe("site photo extraction", () => {
  it("prefers og:image, filters chrome, and absolutizes", () => {
    const html = `
      <meta property="og:image" content="/img/hero.jpg">
      <img src="/assets/logo.png"><img src="https://cdn.site.com/menu-photo.webp">
      <img src="/favicon.ico"><img src="/img/team.jpeg">`;
    const urls = extractImageUrls(html, "https://example.com/about");
    expect(urls[0]).toBe("https://example.com/img/hero.jpg");
    expect(urls).toContain("https://cdn.site.com/menu-photo.webp");
    expect(urls).toContain("https://example.com/img/team.jpeg");
    expect(urls.join(" ")).not.toMatch(/logo|favicon/);
  });
});
