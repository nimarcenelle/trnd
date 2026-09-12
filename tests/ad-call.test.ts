import { describe, expect, it } from "vitest";

import { buildAdCall, type AdCallInput } from "../lib/recommend/ad-call";

const base = (over: Partial<AdCallInput> = {}): AdCallInput => ({
  term: "coffee shop to work",
  score: 7.6,
  signals: { customer: 0.8, brand: 0.9, competitive: 0.8, cultural: null },
  signalReasons: {
    customer: "up 34% search interest this week",
    brand: "you already sell Gold Rush Latte",
    competitive: "1 of your 5 direct rivals is on this (Octane)",
    cultural: "no short-form read on this yet",
  },
  service: { name: "Gold Rush Latte", price_cents: 675 },
  targetCustomer: {
    who: "Remote workers near Glenwood who need a table and outlets for two hours, comparing you against their kitchen table.",
    triggers: ["somewhere to work"],
    vocabulary: ["coffee shop to work"],
    hangouts: [],
    objections: ["too loud"],
  },
  campaign: {
    angle: "Lead with the table, not the drink.",
    hook: "A table, an outlet, and a $6.75 Gold Rush latte until 6",
    offer: "$6.75 Gold Rush latte, weekdays",
    audience: { who: "Remote workers near Glenwood", age_range: "24-38", angle_type: "education" },
  },
  scripts: ["one", "two", "three", "four"],
  culturalPlatform: null,
  ownVideoShare: 0.6,
  medianDurationSec: 22,
  weekPct: 34,
  monthPct: null,
  geoLabel: "Atlanta metro",
  audiencePhrase: "coffee shop to work",
  rivals: { watched: 5, onTerm: 1, names: ["Octane"], proven: 0 },
  rivalThemes: [{ theme: "offer", count: 4 }],
  ownBestTheme: { theme: "education", vsAccount: 1.38, ads: 4 },
  ...over,
});

const banned = /[—→×]/;

describe("the ad call", () => {
  it("says run this ad, what to promote, to whom, and where", () => {
    const call = buildAdCall(base());
    expect(call.verdict).toBe("run");
    expect(call.headline).toBe("Run this ad.");
    expect(call.promote).toBe(
      "Promote your Gold Rush Latte ($6.75) to remote workers near Glenwood, 24-38, on Instagram Reels.",
    );
    expect(call.angle).toBe("A table, an outlet, and a $6.75 Gold Rush latte until 6");
  });

  it("gives a format built from the winning length and the angle's shape", () => {
    expect(buildAdCall(base()).format).toBe(
      "20-second vertical video: the problem, a quick demonstration, the answer. Shot on a phone, in your own space.",
    );
  });

  it("backs the call with a reason from each signal that has one", () => {
    const why = buildAdCall(base()).why;
    expect(why[0]).toBe('Searches up 34% this week in Atlanta metro, in your customer\'s own words ("coffee shop to work")');
    expect(why).toContain("Only 1 of your 5 direct rivals is on it");
    expect(why).toContain("Their ads lean on a price or deal, so teaching something stands apart");
    expect(why).toContain("Your past ads built on teaching something ran 38% above your account average, and this is one");
    // No short-form read: culture says nothing rather than filler.
    expect(why.join(" ")).not.toMatch(/short-form/);
  });

  it("hands over three scripts to test", () => {
    expect(buildAdCall(base()).scripts).toEqual(["one", "two", "three"]);
  });

  it("scales the verdict with the grade", () => {
    expect(buildAdCall(base({ score: 5 })).headline).toBe("Run this ad, small.");
    expect(buildAdCall(base({ score: 3 })).verdict).toBe("skip");
  });

  it("rides the platform that measured the term", () => {
    expect(buildAdCall(base({ culturalPlatform: "tiktok" })).promote).toMatch(/on TikTok and Instagram Reels\.$/);
  });

  it("recommends where the brand already buys ads", () => {
    expect(buildAdCall(base({ culturalPlatform: "tiktok", adPlatforms: ["meta"] })).promote).toMatch(/on Instagram Reels and Facebook\.$/);
    expect(buildAdCall(base({ culturalPlatform: "tiktok", adPlatforms: ["meta", "tiktok"] })).promote).toMatch(/on TikTok and Instagram Reels\.$/);
    expect(buildAdCall(base({ culturalPlatform: null, adPlatforms: ["tiktok"] })).promote).toMatch(/on TikTok\.$/);
  });

  it("promotes what the campaign actually sells when it leads with a truer item than the match", () => {
    const call = buildAdCall(
      base({
        service: { name: "Drip Coffee (Small)", price_cents: 350 },
        ownBestTheme: null,
        campaign: {
          angle: "The room after five.",
          hook: "An espresso martini in a room where you can actually hear your friends talk",
          offer: "$15 Sprotini and $6 fries at Riverside until 10",
          audience: {
            who: "The 5 PM Transitioner, who leaves the office at five and isn't ready to go home.",
            age_range: "25-45",
            angle_type: "offer",
          },
        },
      }),
    );
    expect(call.promote).toBe(
      "Promote the $15 Sprotini and $6 fries at Riverside until 10 to someone who leaves the office at five and isn't ready to go home, 25-45, on Instagram Reels.",
    );
    expect(call.why).toContain("It's already on your menu");
    expect(call.why.join(" ")).not.toMatch(/\$3\.50/);
  });

  it("keeps the description, not the persona label, after a colon", () => {
    const call = buildAdCall(
      base({
        campaign: {
          angle: "a",
          hook: "Gold Rush latte",
          offer: "$6.75 Gold Rush latte",
          audience: { who: "The Sensory Defector: a burned-out professional who wants a quiet table", angle_type: "offer" },
        },
      }),
    );
    expect(call.promote).toMatch(/ to a burned-out professional who wants a quiet table on /);
  });

  it("leaves out a clause with nothing real behind it", () => {
    const call = buildAdCall(
      base({ rivals: null, rivalThemes: [], ownBestTheme: null, weekPct: 2, audiencePhrase: null, campaign: null }),
    );
    expect(call.why).toEqual(["You already sell it at $6.75"]);
    expect(call.angle).toBeNull();
  });

  it("never writes an em dash, arrow or multiplication sign", () => {
    const call = buildAdCall(base({ culturalPlatform: "youtube" }));
    for (const line of [call.headline, call.promote, call.format, ...call.why]) expect(line).not.toMatch(banned);
  });
});
