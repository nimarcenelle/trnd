import type { Business, BusinessBrief, Service } from "@/lib/db/types";

/**
 * Deterministic relevance judge — the keyless half of "does this trend make
 * sense for THIS business". The Gemini judge (lib/ai/gemini.ts) reads the
 * founding analysis and re-ranks with full context when a key is present;
 * this module guarantees the same *kind* of judgment with zero network:
 * a BBQ smokehouse never gets an espresso-martini trend as its #1 just
 * because the trend is category-adjacent and rising fast.
 *
 * Mechanics: every category gets a small concept map (keyword classes with
 * human labels). A business holds the concepts its services, name, voice
 * notes, and watchlist mention; a signal term holds the concepts its words
 * mention. Overlap is fit; a term whose concepts are all absent from the
 * business is a mismatch and gets gated to the C range by applyRelevance,
 * exactly like the model judge would do.
 */

export interface RelevanceJudgment {
  relevance: number; // 0..1 — feeds applyRelevance / the fit component
  reason: string; // plain English, rendered in the rationale
  kind: "service" | "concept" | "general" | "unknown" | "mode" | "mismatch" | "thin-profile";
}

interface Concept {
  key: string;
  /** Human label used in reasons ("bar & cocktails"). */
  label: string;
  /** `word` = whole word; `word*` = prefix stem. Multi-word phrases allowed. */
  keywords: string[];
  /** Mode concepts describe HOW/WHEN (patio, late-night, family, gifting) —
   * a mode the business doesn't mention is a stretch, not a contradiction.
   * Non-mode concepts describe WHAT is sold; those mismatch hard. */
  mode?: boolean;
}

/* ------------------------------ concept maps ------------------------------ */

const CATEGORY_CONCEPTS: Record<string, Concept[]> = {
  "Restaurants & cafés": [
    { key: "coffee", label: "coffee & espresso", keywords: ["coffee", "espresso", "latte*", "matcha", "cappuccino", "cold brew", "roaster*", "mocha", "chai", "cafe", "café"] },
    { key: "cocktails", label: "bar & cocktails", keywords: ["cocktail*", "martini*", "margarita*", "wine*", "beer*", "brewery", "happy hour", "spirits", "whiskey", "bar", "sangria", "mocktail*", "aperitivo"] },
    { key: "brunch", label: "brunch & breakfast", keywords: ["brunch", "breakfast", "pancake*", "waffle*", "omelet*", "bagel*", "mimosa*"] },
    { key: "bakery", label: "bakery & dessert", keywords: ["bakery", "pastry*", "croissant*", "dessert*", "cake*", "donut*", "doughnut*", "ice cream", "gelato", "cookie*"] },
    { key: "dinner", mode: true, label: "dinner & date-night", keywords: ["dinner", "date night", "prix fixe", "tasting", "fine dining", "reservation*", "omakase"] },
    { key: "casual", mode: true, label: "takeout & quick bites", keywords: ["takeout", "late night", "delivery", "food truck", "lunch", "sandwich*", "grab and go"] },
    { key: "bbq", label: "grill & barbecue", keywords: ["bbq", "barbecue", "brisket", "rib", "ribs", "smoked", "smokehouse", "grill*", "steak*", "burger*", "wings", "pitmaster"] },
    { key: "pizza", label: "pizza & pasta", keywords: ["pizza*", "pasta*", "italian", "calzone*"] },
    { key: "global", label: "global flavors", keywords: ["sushi", "ramen", "pho", "thai", "taco*", "burrito*", "curry", "curries", "tikka", "samosa*", "masala", "indian", "mexican", "korean", "mediterranean", "falafel", "shawarma", "dumpling*", "fusion"] },
    { key: "healthy", label: "health-forward menu", keywords: ["vegan", "vegetarian", "gluten free", "salad*", "smoothie*", "juice*", "plant based", "acai"] },
    { key: "patio", mode: true, label: "patio & atmosphere", keywords: ["patio", "rooftop", "live music", "outdoor", "terrace", "esplanade"] },
    { key: "family", mode: true, label: "family & groups", keywords: ["family", "kids", "group*", "party", "catering", "sharing"] },
  ],
  "Home services": [
    { key: "hvac", label: "heating & cooling", keywords: ["hvac", "ac", "heating", "furnace*", "thermostat*", "heat pump", "cooling", "air condition*"] },
    { key: "plumbing", label: "plumbing", keywords: ["plumb*", "drain*", "water heater", "pipe*", "leak*", "sewer"] },
    { key: "cleaning", label: "cleaning", keywords: ["cleaning", "clean", "maid", "janitorial", "housekeep*"] },
    { key: "exterior", label: "exterior & yard", keywords: ["gutter*", "roof*", "landscap*", "pressure washing", "power washing", "lawn", "fence*", "deck*", "siding", "driveway"] },
    { key: "electrical", label: "electrical", keywords: ["electric*", "wiring", "panel", "ev charger", "smart thermostat", "smart home"] },
    { key: "handyman", label: "handyman & repairs", keywords: ["handyman", "odd jobs", "mounting", "assembly", "repair*"] },
    { key: "pest", label: "pest control", keywords: ["pest*", "termite*", "mosquito*", "rodent*"] },
  ],
  "Health & beauty": [
    { key: "injectables", label: "injectables", keywords: ["botox", "filler*", "lip flip", "injectable*", "tox", "sculptra"] },
    { key: "skin", label: "skincare & facials", keywords: ["facial*", "skin", "skincare", "peel*", "hydrafacial", "dermaplan*", "microneedl*", "glass skin", "exfoliat*", "barrier", "laser", "serum*", "retinol"] },
    { key: "hair", label: "hair", keywords: ["hair", "scalp", "blowout*", "balayage", "keratin", "extension*", "salon"] },
    { key: "brows", label: "brows & lashes", keywords: ["brow*", "lash*", "microblad*", "lamination"] },
    { key: "nails", label: "nails", keywords: ["nail*", "manicure*", "pedicure*"] },
    { key: "spa", label: "spa & recovery", keywords: ["massage*", "sauna", "cold plunge", "spa", "float", "cryo*", "contrast therapy"] },
    { key: "makeup", label: "makeup", keywords: ["makeup", "bridal", "glam"] },
    { key: "barber", label: "barbering & grooming", keywords: ["barber*", "fade", "beard", "grooming"] },
  ],
  "Fitness studios": [
    { key: "pilates", label: "pilates, yoga & mobility", keywords: ["pilates", "yoga", "barre", "mobility", "stretch*", "reformer"] },
    { key: "strength", label: "strength training", keywords: ["strength", "weight*", "lifting", "crossfit", "small group"] },
    { key: "cardio", label: "running & cardio", keywords: ["run", "running", "run club", "cycling", "spin", "hiit", "marathon*", "treadmill"] },
    { key: "recovery", label: "recovery & wellness", keywords: ["recovery", "sauna", "cold plunge", "plunge", "contrast therapy", "compression", "wellness"] },
    { key: "combat", label: "boxing & martial arts", keywords: ["boxing", "kickbox*", "martial", "jiu jitsu", "mma"] },
  ],
  "Retail & boutiques": [
    { key: "apparel", label: "apparel", keywords: ["linen", "denim", "dress*", "outfit*", "wardrobe", "apparel", "clothing", "basics", "quiet luxury", "fashion", "capsule", "sets"] },
    { key: "jewelry", label: "jewelry", keywords: ["jewelry", "jewellery", "earring*", "necklace*", "ring*"] },
    { key: "gifts", mode: true, label: "gifts", keywords: ["gift*"] },
    { key: "home", label: "home & lifestyle goods", keywords: ["candle*", "home goods", "decor", "ceramic*", "stationery"] },
    { key: "vintage", label: "vintage & resale", keywords: ["vintage", "thrift*", "consignment", "resale", "secondhand"] },
  ],
  "Auto services": [
    { key: "detailing", label: "detailing & appearance", keywords: ["detail*", "ceramic", "wash", "wax*", "paint protection", "ppf", "headlight*", "tint*", "coating"] },
    { key: "repair", label: "repair & maintenance", keywords: ["oil change", "brake*", "repair*", "mechanic*", "windshield", "engine", "transmission", "alignment", "suspension", "battery*", "check engine", "inspection*", "tune up"] },
    { key: "tires", label: "tires & wheels", keywords: ["tire*", "wheel*"] },
    { key: "ev", label: "EV service", keywords: ["ev", "electric vehicle", "charging", "tesla"] },
    { key: "fleet", mode: true, label: "fleet service", keywords: ["fleet*"] },
  ],
  "Dental & wellness": [
    { key: "dental", label: "dentistry", keywords: ["dental", "dentist*", "teeth", "tooth", "whitening", "invisalign", "aligner*", "veneer*", "crown*", "orthodont*", "cavity", "root canal", "implant*", "smile", "gum*", "sleep apnea", "hygien*"] },
    { key: "wellness", label: "wellness & IV therapy", keywords: ["iv", "hydration", "vitamin*", "wellness", "chiropract*", "acupunct*", "drip"] },
  ],
};

/** Terms broad enough that any business in the category can ride them. */
const GENERAL_KEYWORDS: Record<string, string[]> = {
  "Restaurants & cafés": ["eats", "dining", "restaurant*", "food*", "menu", "foodie", "chef*"],
  "Home services": ["same day", "same-day", "home service*", "contractor*", "appointment*", "estimate*"],
  "Health & beauty": ["beauty", "self care", "aesthetic*", "glow*", "treatment*"],
  "Fitness studios": ["fitness", "workout*", "gym", "class*", "training", "membership*", "new year"],
  "Retail & boutiques": ["boutique*", "shop*", "store*", "finds", "new arrivals", "local"],
  "Auto services": ["auto", "car*", "vehicle*"],
  "Dental & wellness": ["checkup*", "visit*", "appointment*"],
};

/* ------------------------------ matching ------------------------------ */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function keywordRe(kw: string): RegExp {
  if (kw.endsWith("*")) return new RegExp(`\\b${escapeRe(kw.slice(0, -1))}`, "i");
  return new RegExp(`\\b${escapeRe(kw)}\\b`, "i");
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => keywordRe(kw).test(text));
}

/** Concepts a piece of text touches, for one category. */
export function conceptsForText(text: string, category: string): Concept[] {
  return (CATEGORY_CONCEPTS[category] ?? []).filter((c) => matchesAny(text, c.keywords));
}

function isGeneralTerm(term: string, category: string): boolean {
  return matchesAny(term, GENERAL_KEYWORDS[category] ?? []);
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "near", "me",
  "at", "vs", "with", "your", "my", "before", "after", "best",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export interface BusinessFitContext {
  concepts: Concept[];
  hasProfileSignal: boolean;
  services: Service[];
}

/** Everything we know a business is about, folded into concept space. */
export function buildBusinessFitContext(
  business: Pick<Business, "name" | "category" | "brand_voice_notes">,
  services: Service[],
  brief: Pick<BusinessBrief, "watch_terms" | "positioning"> | null,
): BusinessFitContext {
  const active = services.filter((s) => s.is_active);
  const text = [
    business.name,
    business.brand_voice_notes ?? "",
    ...active.map((s) => `${s.name} ${s.description ?? ""}`),
    ...(brief?.watch_terms ?? []),
    brief?.positioning ?? "",
  ].join("\n");
  return {
    concepts: conceptsForText(text, business.category),
    hasProfileSignal: active.length > 0 || Boolean(business.brand_voice_notes),
    services: active,
  };
}

const listLabels = (concepts: Concept[]) =>
  concepts.slice(0, 2).map((c) => c.label).join(" and ");

/**
 * Judge one signal term against the business. Deterministic, explainable,
 * and shaped exactly like the model judge's output so applyRelevance treats
 * both the same.
 */
export function judgeTermRelevance(
  term: string,
  category: string,
  ctx: BusinessFitContext,
): RelevanceJudgment {
  // 1. Direct hit on something they sell — the strongest possible fit.
  const termTokens = tokens(term);
  let bestService: { service: Service; overlap: number } | null = null;
  for (const s of ctx.services) {
    const overlap = [...tokens(`${s.name} ${s.description ?? ""}`)].filter((t) => termTokens.has(t)).length;
    if (overlap > 0 && (!bestService || overlap > bestService.overlap)) {
      bestService = { service: s, overlap };
    }
  }
  if (bestService) {
    return {
      relevance: Math.min(0.95, 0.7 + bestService.overlap * 0.1),
      reason: `this is squarely what ${bestService.service.name} sells`,
      kind: "service",
    };
  }

  const termConcepts = conceptsForText(term, category);

  // 2. Term is too generic to classify — broad category demand.
  if (termConcepts.length === 0) {
    if (isGeneralTerm(term, category)) {
      return {
        relevance: 0.55,
        reason: `a broad ${category.toLowerCase()} trend — any local player can ride it, including you`,
        kind: "general",
      };
    }
    return {
      relevance: 0.45,
      reason: `can't tie “${term}” directly to what you sell — treat it as a stretch`,
      kind: "unknown",
    };
  }

  // 3. Thin profile — no services or voice notes to judge against.
  if (!ctx.hasProfileSignal || ctx.concepts.length === 0) {
    return {
      relevance: 0.45,
      reason: "your profile is thin — add services in Settings so fit can be judged properly",
      kind: "thin-profile",
    };
  }

  // 4. Concept overlap — same lane, even without a literal service match.
  const shared = termConcepts.filter((tc) => ctx.concepts.some((bc) => bc.key === tc.key));
  if (shared.length > 0) {
    return {
      relevance: Math.min(0.75, 0.6 + (shared.length - 1) * 0.05),
      reason: `same lane as your ${listLabels(shared)} side — a natural extension of what you already do`,
      kind: "concept",
    };
  }

  // 5. A mode-only term (patio, late-night, family, gifting) is a stretch,
  // not a contradiction — any business in the category could try it.
  if (termConcepts.every((c) => c.mode)) {
    return {
      relevance: 0.5,
      reason: `a ${listLabels(termConcepts)} angle — not something you advertise today, but any ${category.toLowerCase()} business could try it`,
      kind: "mode",
    };
  }

  // 6. Classified term, zero overlap — the espresso-martini-for-a-BBQ-shack
  // case. Momentum must not carry this to #1.
  return {
    relevance: 0.2,
    reason: `“${term}” is a ${listLabels(termConcepts.filter((c) => !c.mode))} trend — nothing you sell touches it`,
    kind: "mismatch",
  };
}
