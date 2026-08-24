import type { Business, NewBusinessBrief, Service } from "@/lib/db/types";
import { isGeminiConfigured } from "@/lib/env";

export const BRIEF_FALLBACK_MODEL = "trnd-template/v1";
export const BRIEF_PROMPT_VERSION = "brief-1";

/**
 * The positioning read a business gets when it joins: what they do well,
 * where the moat is, which edges to press in ads, and what to avoid.
 * Deterministic template here; Gemini takes over when the key is present.
 */

const WATCHOUTS: Record<string, string[]> = {
  "Health & beauty": [
    "No before/after promises or medical claims — ad platforms reject them and they invite scrutiny.",
    "Don't compete on discounts; sell judgment, safety, and taste. Cheap looks risky in this category.",
  ],
  "Dental & wellness": [
    "Health claims and guarantees get ads rejected — sell comfort, clarity, and convenience instead.",
    "Avoid fear-based messaging; it converts poorly and erodes trust in a provider relationship.",
  ],
  "Restaurants & cafés": [
    "Avoid a discount-led identity — it fills seats once with deal hunters, not regulars.",
    "Never advertise an item you can't deliver consistently at rush; one bad first visit undoes the ad.",
  ],
  "Home services": [
    "Don't lead with 'cheapest' — those leads price-shop every job. Sell speed and reliability.",
    "Don't promise arrival windows the schedule can't keep; missed windows become public reviews.",
  ],
  "Fitness studios": [
    "Body-transformation claims are restricted on ad platforms — sell energy, community, and consistency.",
    "Don't market intensity to beginners; it reads as a barrier, not a benefit.",
  ],
  "Retail & boutiques": [
    "Constant sale messaging trains your audience to wait for the next one — protect full price.",
    "Avoid generic product shots; your edit and your point of view are the reason to buy here.",
  ],
  "Auto services": [
    "Avoid scare tactics about safety; convenience and honesty convert better and hold trust.",
    "Don't quote prices in ads you can't honor on arrival — bait pricing kills local reputation.",
  ],
};

const MOATS: Record<string, string> = {
  "Health & beauty":
    "Trust compounds here: results people can see, practitioners they come back to. A national brand can't replicate a face someone already trusts.",
  "Dental & wellness":
    "Patients switch providers rarely — winning the first visit wins years of visits. Local trust is the whole game.",
  "Restaurants & cafés":
    "You're a habit, not a transaction. Being someone's default spot in a 20-minute radius is a position no delivery app can take.",
  "Home services":
    "Showing up on time, twice, makes you the contact in someone's phone. That saved contact is the moat.",
  "Fitness studios":
    "Community is the retention engine — people stay for the people. That can't be copied by a cheaper gym.",
  "Retail & boutiques":
    "Your curation is the product. An algorithm can list items; it can't have taste people identify with.",
  "Auto services":
    "Car trouble is a trust purchase. The shop people recommend by name owns the neighborhood.",
};

const PRICE_ADVANTAGE: Record<string, string> = {
  "$": "Accessible pricing is an honest hook — lead with the real number; it beats vague 'affordable' claims.",
  "$$": "Mid-market sweet spot: premium feel without premium anchor pricing — name the price in the ad with confidence.",
  "$$$": "Premium price is a filter, not a barrier — say it plainly and sell the standard behind it.",
};

export function buildFallbackBrief(business: Business, services: Service[]): NewBusinessBrief {
  const active = services.filter((s) => s.is_active);
  const named = active.slice(0, 3).map((s) => s.name);
  const doesWell: string[] = [];
  if (named.length > 0) {
    doesWell.push(
      `A focused menu people can actually choose from — ${named.join(", ")}${active.length > 3 ? ` and ${active.length - 3} more` : ""}.`,
    );
  }
  doesWell.push(
    `A real place in ${business.city}${business.region ? `, ${business.region}` : ""} — local intent converts far better than broad reach, and you own the ${business.radius_miles}-mile radius that matters.`,
  );
  if (business.brand_voice_notes) {
    doesWell.push("A voice of your own — your ads can sound like you, not like a template.");
  }

  const advantages = [
    PRICE_ADVANTAGE[business.price_band ?? "$$"] ?? PRICE_ADVANTAGE["$$"],
    "Speed: TRND hands you a finished campaign while competitors are still noticing the trend — first-mover on local demand is cheap attention.",
    "One clear offer per ad, priced from your actual menu — specificity beats cleverness in this category.",
  ];

  const watchouts = WATCHOUTS[business.category] ?? [
    "Don't compete on price alone — sell the thing only you can claim.",
    "One offer per ad; stacked offers depress conversion.",
  ];

  return {
    business_id: business.id,
    does_well: doesWell,
    moat: MOATS[business.category] ?? "Local trust, earned in person, that bigger players can't buy.",
    advantages,
    watchouts,
    model_used: BRIEF_FALLBACK_MODEL,
    prompt_version: BRIEF_PROMPT_VERSION,
  };
}

export async function generateBusinessBrief(
  business: Business,
  services: Service[],
): Promise<NewBusinessBrief> {
  if (isGeminiConfigured) {
    try {
      const { generateBriefWithGemini } = await import("./gemini");
      return await generateBriefWithGemini(business, services);
    } catch (err) {
      console.warn("[ai] Gemini brief failed — using deterministic fallback:", (err as Error).message);
    }
  }
  return buildFallbackBrief(business, services);
}
