import { AD_SPEND_BANDS, type AdPlatform, type AdSpendBand, type BusinessMarket } from "@/lib/db/types";

/**
 * Online brand or local place: the one fact that decides whether TRND reads
 * demand nationally against competing brands or inside a radius against the
 * places down the street. Pure on purpose, so the site import, onboarding and
 * settings share one decision and one set of allowed values, and the tests
 * run without a server.
 */

/** One-tap starting points for an online brand. Category stays free text. */
export const ONLINE_CATEGORIES = [
  "Beauty & skincare",
  "Fashion & apparel",
  "Wellness & supplements",
  "Food & beverage",
  "Home & lifestyle",
] as const;

export const SPEND_BAND_LABELS: Record<AdSpendBand, string> = {
  "under-20k": "Under $20K",
  "20-50k": "$20K to $50K",
  "50-100k": "$50K to $100K",
  "100-250k": "$100K to $250K",
  "250k-plus": "$250K+",
};

export const AD_PLATFORM_OPTIONS: { value: AdPlatform; label: string }[] = [
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "snapchat", label: "Snapchat" },
];

const PLATFORM_VALUES = new Set<string>(AD_PLATFORM_OPTIONS.map((p) => p.value));
const SPEND_VALUES = new Set<string>(AD_SPEND_BANDS);

/** "123 Main St", "40 W 25th Street". Capitalized words only, so marketing
 * copy like "ships 2 days our way" doesn't read as a storefront door. */
const STREET_ADDRESS =
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z0-9][\w'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Pkwy|Parkway|Hwy|Highway|Sq|Square|Ter|Terrace)\b/;

export function hasStreetAddress(text: string): boolean {
  return STREET_ADDRESS.test(text);
}

// Places people walk into. These win even on a Shopify site: a café that
// ships its beans online is still a café, and its customers are nearby.
const PLACE_CATEGORY =
  /\b(caf[eé]s?|coffee|espresso|restaurants?|bakery|bakeries|bistro|diner|eatery|pizzeria|bars?|pubs?|brewery|salons?|barbers?|barbershop|spas?|med ?spa|gyms?|fitness|studios?|yoga|pilates|clinics?|dental|dentists?|orthodont\w*|chiropract\w*|services?|plumb\w*|hvac|roofing|auto|repair|detailing|car wash)\b/i;

// Retail words and the broad beauty vertical describe a boutique down the
// street and a national DTC brand equally. On a storefront they describe the
// online store itself, so they only count as a place off one.
const SHOPFRONT_CATEGORY = /\b(shops?|boutiques?|stores?|retail)\b|health\s*&\s*beauty/i;

export function decideMarket(input: {
  storefront: boolean;
  streetAddress: boolean;
  category?: string;
}): BusinessMarket {
  // No door to walk through means no radius to read. Online is the default.
  if (!input.streetAddress) return "online";
  const category = input.category ?? "";
  if (PLACE_CATEGORY.test(category)) return "local";
  if (!input.storefront && SHOPFRONT_CATEGORY.test(category)) return "local";
  return "online";
}

export interface MarketProfile {
  market: BusinessMarket;
  monthly_ad_spend: AdSpendBand | null;
  ad_platforms: AdPlatform[];
}

/**
 * The market, spend band and ad platforms as posted. Every control offers
 * only allowed values, so anything else is a hand-built request and is
 * refused rather than stored. A missing market falls back (a form rendered
 * before the field existed was a local onboarding); a blank spend is "not
 * given".
 */
export function parseMarketProfile(
  input: { market: unknown; spend: unknown; platforms: unknown[] },
  fallbackMarket: BusinessMarket = "local",
): { profile: MarketProfile } | { error: string } {
  const rawMarket = typeof input.market === "string" ? input.market.trim() : "";
  if (rawMarket && rawMarket !== "online" && rawMarket !== "local") {
    return { error: "Pick whether you sell online or are a local business." };
  }
  const market: BusinessMarket = rawMarket ? (rawMarket as BusinessMarket) : fallbackMarket;

  const rawSpend = typeof input.spend === "string" ? input.spend.trim() : "";
  if (rawSpend && !SPEND_VALUES.has(rawSpend)) {
    return { error: "Pick your monthly ad spend from the list." };
  }

  const picked = new Set<string>();
  for (const value of input.platforms) {
    const v = typeof value === "string" ? value.trim() : "";
    if (!v) continue;
    if (!PLATFORM_VALUES.has(v)) return { error: "Pick where you run ads from the list." };
    picked.add(v);
  }

  return {
    profile: {
      market,
      monthly_ad_spend: rawSpend ? (rawSpend as AdSpendBand) : null,
      // Stored in the list's order, so the same picks always save the same.
      ad_platforms: AD_PLATFORM_OPTIONS.map((p) => p.value).filter((v) => picked.has(v)),
    },
  };
}
