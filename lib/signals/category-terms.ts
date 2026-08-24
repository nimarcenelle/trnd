/**
 * Per-category watchlists: which subreddits to read, which terms to track in
 * news/trends, and a keyword lexicon for classifying generic trending
 * searches into a category. Category-agnostic plumbing — extending a
 * category is editing this file, not the code.
 */

export interface CategoryConfig {
  category: string;
  subreddits: string[];
  watchTerms: string[];
  lexicon: string[];
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    category: "Restaurants & cafés",
    subreddits: ["food", "Cooking", "coffee", "espresso"],
    watchTerms: ["brunch near me", "matcha latte", "iced coffee", "date night restaurant", "patio dining"],
    lexicon: ["restaurant", "brunch", "coffee", "latte", "matcha", "cafe", "espresso", "recipe", "food", "dining", "pizza", "sushi", "bakery", "cocktail"],
  },
  {
    category: "Home services",
    subreddits: ["HomeImprovement", "Plumbing", "HVAC", "landscaping"],
    watchTerms: ["ac tune up", "gutter cleaning", "same day plumber", "house cleaning service", "pressure washing"],
    lexicon: ["plumber", "hvac", "gutter", "roof", "cleaning", "handyman", "lawn", "landscap", "pest", "electrician", "renovation", "repair"],
  },
  {
    category: "Health & beauty",
    subreddits: ["30PlusSkinCare", "SkincareAddiction", "Hair", "MakeupAddiction"],
    watchTerms: ["facial balancing", "skin barrier", "brow lamination", "lip filler", "hydrafacial"],
    lexicon: ["skincare", "skin", "botox", "filler", "facial", "brow", "lash", "hair", "makeup", "spa", "peel", "laser", "serum", "retinol"],
  },
  {
    category: "Fitness studios",
    subreddits: ["Fitness", "xxfitness", "pilates", "running"],
    watchTerms: ["reformer pilates", "cold plunge", "strength training women", "run club", "mobility class"],
    lexicon: ["workout", "gym", "pilates", "yoga", "fitness", "training", "run", "marathon", "crossfit", "cycling", "recovery", "sauna", "plunge"],
  },
  {
    category: "Retail & boutiques",
    subreddits: ["femalefashionadvice", "malefashionadvice", "streetwear"],
    watchTerms: ["quiet luxury", "linen sets", "vintage denim", "gift shop near me", "capsule wardrobe"],
    lexicon: ["fashion", "outfit", "denim", "dress", "boutique", "jewelry", "gift", "thrift", "vintage", "style", "linen", "sneaker"],
  },
  {
    category: "Auto services",
    subreddits: ["MechanicAdvice", "AutoDetailing", "cars"],
    watchTerms: ["ceramic coating", "mobile detailing", "winter tires", "windshield repair", "paint protection film"],
    lexicon: ["car", "auto", "tire", "detailing", "ceramic", "oil change", "brake", "windshield", "mechanic", "ev charging"],
  },
  {
    category: "Dental & wellness",
    subreddits: ["Dentistry", "Invisalign", "orthodontics"],
    watchTerms: ["invisalign cost", "teeth whitening", "veneers", "iv hydration", "sleep apnea dentist"],
    lexicon: ["dental", "dentist", "teeth", "invisalign", "veneer", "whitening", "orthodont", "crown", "iv drip", "wellness"],
  },
];

/** Best-effort classification of a generic trending term into a category. */
export function classifyTerm(term: string): string | null {
  const t = term.toLowerCase();
  let best: { category: string; hits: number } | null = null;
  for (const cfg of CATEGORY_CONFIGS) {
    const hits = cfg.lexicon.filter((k) => t.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { category: cfg.category, hits };
    }
  }
  return best?.category ?? null;
}
