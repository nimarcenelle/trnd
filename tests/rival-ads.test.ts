import { describe, expect, it } from "vitest";

import {
  PROVEN_DAYS,
  classifyAdCopy,
  readAdvertiser,
  toAdvertiserAds,
} from "../lib/signals/adlibrary-apify";
import { parseTransparencyText, readGoogleAds, type GoogleAd } from "../lib/signals/google-ads-transparency";

const NOW = new Date("2026-09-12T12:00:00Z");
const unix = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

// Shaped like curious_coder/facebook-ads-library-scraper output, with the
// key spellings it has shipped under (snake and camel) mixed on purpose.
const ITEMS: unknown[] = [
  {
    ad_archive_id: "111",
    page_name: "Bellwood Bakery",
    start_date: unix("2026-08-01"),
    is_active: true,
    publisher_platform: ["FACEBOOK", "INSTAGRAM"],
    collation_count: 3,
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=111",
    snapshot: {
      body: { text: "Only 12 seats left  for Saturday's\nsourdough class" },
      title: "Sourdough 101",
      link_url: "https://bellwood.example/class",
      cta_text: "Sign up",
    },
  },
  {
    adArchiveID: "222",
    pageName: "Bellwood Bakery",
    startDate: "2026-09-09T00:00:00.000Z",
    snapshot: { body: { text: "Now serving brand new cardamom buns" } },
  },
  { page_name: "No id at all", snapshot: { body: { text: "dropped" } } },
  { ad_archive_id: "111", snapshot: { body: { text: "duplicate id, dropped" } } },
  { ad_archive_id: "333", start_date: "not a date", end_date: unix("2026-09-01"), snapshot: {} },
  "garbage",
  null,
];

describe("toAdvertiserAds", () => {
  const ads = toAdvertiserAds(ITEMS, NOW);

  it("maps unix-dated items with every field", () => {
    expect(ads.map((a) => a.id)).toEqual(["111", "222", "333"]);
    const a = ads[0];
    expect(a.advertiser).toBe("Bellwood Bakery");
    expect(a.snippet).toBe("Only 12 seats left for Saturday's sourdough class");
    expect(a.headline).toBe("Sourdough 101");
    expect(a.cta).toBe("Sign up");
    expect(a.landing).toBe("https://bellwood.example/class");
    expect(a.startedOn).toBe("2026-08-01");
    expect(a.runningDays).toBe(42);
    expect(a.platforms).toEqual(["facebook", "instagram"]);
    expect(a.variants).toBe(3);
    expect(a.active).toBe(true);
    expect(a.url).toBe("https://www.facebook.com/ads/library/?id=111");
  });

  it("maps ISO dates and fills missing fields with honest defaults", () => {
    const b = ads[1];
    expect(b.startedOn).toBe("2026-09-09");
    expect(b.runningDays).toBe(3);
    expect(b.headline).toBeNull();
    expect(b.cta).toBeNull();
    expect(b.landing).toBeNull();
    expect(b.platforms).toEqual([]);
    expect(b.variants).toBe(1);
    // No flag and no end date: still running.
    expect(b.active).toBe(true);
    expect(b.url).toContain("id=222");
  });

  it("keeps an image-only ad with an unreadable start and a past end as inactive", () => {
    const c = ads[2];
    expect(c.snippet).toBe("");
    expect(c.startedOn).toBeNull();
    expect(c.runningDays).toBeNull();
    expect(c.active).toBe(false);
  });

  it("never throws on junk", () => {
    expect(toAdvertiserAds([], NOW)).toEqual([]);
    expect(toAdvertiserAds([1, "x", [], {}], NOW)).toEqual([]);
  });
});

describe("readAdvertiser", () => {
  const ads = toAdvertiserAds(
    [
      ...ITEMS,
      // Exactly on the threshold: counts as proven.
      { ad_archive_id: "444", start_date: "2026-08-22", snapshot: { body: { text: "Rated 5-star by 2,000 neighbors" } } },
      // One day short.
      { ad_archive_id: "555", start_date: "2026-08-23", snapshot: { body: { text: "Did you know sourdough is easier to digest?" } } },
      // Image-only and new: counts as active and new, not as a theme.
      { ad_archive_id: "666", start_date: "2026-09-08", snapshot: {} },
    ],
    NOW,
  );
  const read = readAdvertiser(ads, NOW);

  it("counts active, longest-running and new this week", () => {
    expect(read.active).toBe(5);
    expect(read.longestRunningDays).toBe(42);
    expect(read.newThisWeek).toBe(2);
  });

  it(`treats ${PROVEN_DAYS}+ days as proven, longest first`, () => {
    expect(read.proven.map((a) => [a.id, a.runningDays])).toEqual([
      ["111", 42],
      ["444", 21],
    ]);
  });

  it("counts themes from ads that have words", () => {
    const counts = Object.fromEntries(read.themes.map((t) => [t.theme, t.count]));
    expect(counts).toEqual({ scarcity: 1, novelty: 1, social_proof: 1, education: 1 });
  });

  it("samples at most five, proven first", () => {
    expect(read.sample.length).toBe(5);
    expect(read.sample.slice(0, 2).map((a) => a.id)).toEqual(["111", "444"]);
    expect(read.sample[2].id).toBe("555");
  });

  it("recomputes running days against now", () => {
    const later = readAdvertiser(ads, new Date("2026-09-19T12:00:00Z"));
    expect(later.longestRunningDays).toBe(49);
    expect(later.proven.map((a) => a.id)).toEqual(["111", "444", "555"]);
    expect(later.newThisWeek).toBe(0);
  });

  it("is empty-safe", () => {
    expect(readAdvertiser([], NOW)).toEqual({
      active: 0,
      longestRunningDays: null,
      newThisWeek: 0,
      proven: [],
      themes: [],
      sample: [],
    });
  });
});

describe("classifyAdCopy", () => {
  it.each([
    ["Why your furnace makes that banging noise", "education"],
    ["20% off every pastry, all September", "offer"],
    ["Last chance: 3 spots left in the Saturday class", "scarcity"],
    ["Voted best of Asheville three years running", "social_proof"],
    ["Same-day AC repair from licensed techs", "speed"],
    ["Introducing our fall menu", "novelty"],
  ])("%s -> %s", (text, theme) => {
    expect(classifyAdCopy(text)).toBe(theme);
  });

  it("does not let everyday ad words pick a theme", () => {
    // "today", "only" and "first" are in every local ad; none of them alone
    // is urgency, speed or novelty.
    expect(classifyAdCopy("Call today to book your first visit")).toBe("offer");
    expect(classifyAdCopy("The only family bakery downtown")).toBe("offer");
    expect(classifyAdCopy("")).toBe("offer");
  });

  it("is deterministic when copy carries two themes", () => {
    expect(classifyAdCopy("Half off lattes, this weekend only")).toBe("scarcity");
  });
});

// APPROXIMATE: reconstructed from the Transparency Center's layout, not
// copied from a live render. It pins the parser's tolerance, not Google's DOM.
const TRANSPARENCY = `
Ads Transparency Center
Bellwood Plumbing LLC
Verified advertiser
bellwoodplumbing.com
Showing 3 ads
Text ad
Emergency Plumber in Asheville
24/7 licensed plumbers, same-day service
bellwoodplumbing.com
First shown: Jul 1, 2026
Last shown: Sep 10, 2026
Video ad
Last shown: Aug 1, 2026
Image
First shown: 6/15/2026
Last shown: 9/11/2026
`;

describe("parseTransparencyText", () => {
  it("reads cards with format, copy and shown dates", () => {
    const ads = parseTransparencyText(TRANSPARENCY, { domain: "bellwoodplumbing.com" });
    expect(ads.length).toBe(3);
    expect(ads[0]).toMatchObject({
      advertiser: "Bellwood Plumbing LLC",
      format: "text",
      snippet: "Emergency Plumber in Asheville 24/7 licensed plumbers, same-day service",
      firstShown: "2026-07-01",
      lastShown: "2026-09-10",
    });
    expect(ads[0].url).toContain("domain=bellwoodplumbing.com");
    expect(ads[1]).toMatchObject({ format: "video", snippet: "", firstShown: null, lastShown: "2026-08-01" });
    expect(ads[2]).toMatchObject({ format: "image", firstShown: "2026-06-15", lastShown: "2026-09-11" });
    expect(new Set(ads.map((a) => a.id)).size).toBe(3);
  });

  it("degrades to [] on garbage", () => {
    expect(parseTransparencyText("")).toEqual([]);
    expect(parseTransparencyText("lorem\nipsum\n$$$\nText ad\nFirst shown: someday")).toEqual([]);
    expect(parseTransparencyText(undefined as unknown as string)).toEqual([]);
    expect(parseTransparencyText("Sign in\nYou have no ads to show")).toEqual([]);
  });
});

describe("readGoogleAds", () => {
  const ad = (id: string, format: GoogleAd["format"], firstShown: string | null, lastShown: string | null): GoogleAd => ({
    id,
    advertiser: "Bellwood Plumbing LLC",
    format,
    snippet: "",
    firstShown,
    lastShown,
    url: "https://adstransparency.google.com/",
  });

  it("counts live ads, formats, and samples live and long-running first", () => {
    const read = readGoogleAds(
      [
        ad("old", "text", "2026-01-01", "2026-08-01"),
        ad("short", "video", "2026-09-05", "2026-09-11"),
        ad("long", "text", "2026-05-01", "2026-09-10"),
        ad("edge", "image", null, "2026-08-29"),
        ad("undated", "unknown", null, null),
      ],
      NOW,
    );
    expect(read.active).toBe(3);
    expect(read.formats).toEqual({ text: 2, image: 1, video: 1, unknown: 1 });
    expect(read.sample.map((a) => a.id)).toEqual(["long", "short", "edge"]);
  });

  it("is empty-safe", () => {
    expect(readGoogleAds([], NOW)).toEqual({ active: 0, formats: { text: 0, image: 0, video: 0, unknown: 0 }, sample: [] });
  });
});
