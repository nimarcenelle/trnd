import type { AdvertiserAd } from "@/lib/signals/adlibrary-apify";

/**
 * The read an install without APIFY_TOKEN and OPENAI_API_KEY shows: an
 * invented shower-filter brand and four invented rivals, run through the
 * same arithmetic as a live read so the page demos end to end. Every name
 * here is made up, and the page says so above the first card.
 */

export const EXAMPLE_BRAND = {
  name: "Rinse",
  domain: "rinse.example",
  category: "Shower filters",
  products: [
    { name: "The Rinse Filter", price: "$68" },
    { name: "Refill Cartridge (3-pack)", price: "$45" },
    { name: "Travel Filter", price: "$38" },
  ],
  siteText:
    "Rinse is a vitamin C shower filter that screws onto any showerhead in a minute. Softer hair, calmer skin, no plumber. Refills ship every 90 days.",
};

export const EXAMPLE_RIVALS = [
  { name: "Clearwell", domain: "clearwell.example", why: "Filtered showerheads at a similar price, sold to the same hair-and-skin buyer." },
  { name: "Softstream", domain: "softstream.example", why: "Screw-on shower filters with a refill subscription." },
  { name: "Aquaveil", domain: "aquaveil.example", why: "A premium filtered showerhead for dry, color-treated hair." },
  { name: "Hydrine", domain: "hydrine.example", why: "A budget screw-on filter sold on hard-water relief." },
];

const day = (daysAgo: number, now: Date) => new Date(now.getTime() - daysAgo * 86400_000).toISOString().slice(0, 10);

function ad(advertiser: string, id: string, daysAgo: number, snippet: string, now: Date, headline: string | null = null): AdvertiserAd {
  return {
    id: `example-${id}`,
    advertiser,
    snippet,
    headline,
    cta: "Shop now",
    landing: null,
    startedOn: day(daysAgo, now),
    runningDays: daysAgo,
    platforms: ["facebook", "instagram"],
    variants: 1,
    active: true,
    url: "https://www.facebook.com/ads/library/",
  };
}

export function exampleAds(now = new Date()): Record<string, AdvertiserAd[]> {
  return {
    Rinse: [
      ad("Rinse", "r1", 74, "Meet the shower filter that installs in one minute. Vitamin C, no plumber.", now, "The Rinse Filter"),
      ad("Rinse", "r2", 41, "Softer hair is one screw-on away. Shop the Rinse Filter.", now, "Shop Rinse"),
      ad("Rinse", "r3", 9, "Free shipping on every filter this week.", now, "Free shipping"),
      ad("Rinse", "r4", 5, "Introducing the Travel Filter. Your shower, anywhere.", now, "New: Travel Filter"),
    ],
    Clearwell: [
      ad("Clearwell", "c1", 118, "Hair that feels like straw after every shower is a water problem, not a shampoo problem.", now, "It's the water"),
      ad("Clearwell", "c2", 63, "Sick of flaky skin all winter. Hard water strips it every morning.", now),
      ad("Clearwell", "c3", 12, "20% off Clearwell this weekend.", now),
    ],
    Softstream: [
      ad("Softstream", "s1", 96, "My hair stopped breaking the month I changed one thing in my bathroom.", now, "What changed"),
      ad("Softstream", "s2", 44, "Sick of the white crust on your showerhead. The same crust is on your skin.", now),
      ad("Softstream", "s3", 30, "Watch the water change color when the filter goes in.", now, "See it work"),
    ],
    Aquaveil: [
      ad("Aquaveil", "a1", 131, "Dry, dull hair after every wash is a water problem. Your conditioner can't fix it.", now, "It's not your conditioner"),
      ad("Aquaveil", "a2", 52, "Colorist-approved. Rated 4.8 by thousands of customers.", now),
    ],
    Hydrine: [
      ad("Hydrine", "h1", 88, "Watch what hard water leaves behind, then watch Hydrine catch it.", now, "Watch this"),
      ad("Hydrine", "h2", 27, "Save 30% on your first filter.", now),
    ],
  };
}

/** The example read's brief, written by hand the way the model writes one. */
export const EXAMPLE_BRIEF = {
  title: "It was never your shampoo",
  product: "The Rinse Filter",
  hypothesis:
    "If we open on the straw-dry hair a hard-water shower leaves behind, then more people who already blame their shampoo stop scrolling, because they're living the problem before they know the fix exists.",
  hook: "You've changed shampoo three times. It was never the shampoo.",
  beats: [
    {
      at: "0–1s",
      see: "Close on wet hair being wrung out over a sink, stiff and tangled, three shampoo bottles behind it.",
      onScreen: "It was never the shampoo.",
      say: "You've changed shampoo three times. It was never the shampoo.",
    },
    {
      at: "1–2s",
      see: "Hand unscrews the showerhead and screws the Rinse Filter on in one motion.",
      onScreen: "none",
      say: "It's the water.",
    },
    {
      at: "2–3s",
      see: "The same hair, dry now, a hand running through it without catching.",
      onScreen: "The Rinse Filter",
      say: "none",
    },
  ],
};
