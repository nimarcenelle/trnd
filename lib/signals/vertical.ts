import { CATEGORIES, type Category } from "@/lib/db/types";

/**
 * A business's `category` is FREE TEXT — its own identity in the customer's
 * words ("contrast therapy & recovery studio"), written by the site analysis
 * and editable by the owner. The seven CATEGORIES are internal signal
 * VERTICALS: they seed the daily market scan and key the deterministic
 * playbooks (stock terms, concept maps, seasonal moments, content angles).
 *
 * This resolver is the only bridge between the two: given a free-text
 * identity (plus optional hints — service names, the brief's lexicon), find
 * the nearest vertical so the keyed machinery still applies. Prompts and
 * copy always use the free text verbatim; only keyed lookups resolve.
 */

// Scored by distinct keyword hits, not first match — "fitness recovery" in a
// nav must not outvote a page of sauna and contrast therapy. Recovery and
// wellness live under Health & beauty by product decision: what the customer
// buys there is a treatment, not a workout.
const VERTICAL_KEYWORDS: [Category, RegExp[]][] = [
  [
    "Restaurants & cafés",
    [/coffee|cafe|café|espresso/, /brunch|breakfast|lunch|dinner/, /restaurant|bistro|eatery|kitchen/, /bakery|patisserie|dessert/, /pizza|taco|sushi|burger|bbq|barbecue/, /bar\b|brewery|winery|cocktail/, /food|menu|dining/],
  ],
  [
    "Health & beauty",
    [/spa\b|medspa|med spa/, /botox|filler|aesthetic|cosmetic(?!\s+dentist)/, /facial|skincare|skin\b/, /salon|barber|hair\b|lash|brow|nail|waxing/, /sauna|cold plunge|ice bath|contrast therapy|cryotherapy|float/, /recovery|wellness(?!\s+clinic)/, /massage|bodywork/, /iv\b|iv drip|vitamin/, /red light|infrared/],
  ],
  [
    "Home services",
    [/plumb/, /hvac|heating|cooling|air condition/, /roof/, /electric/, /landscap|lawn|tree\b/, /handyman|remodel|renovat/, /cleaning|maid|janitorial/, /pest|exterminat/, /painting|flooring|garage/],
  ],
  [
    "Fitness studios",
    [/gym\b/, /yoga|pilates|barre/, /crossfit|hiit|bootcamp/, /training|trainer|coaching/, /class(es)?\b|workout|exercise/, /cycling|spin\b|climbing|martial arts|boxing|jiu/],
  ],
  [
    "Retail & boutiques",
    [/boutique|shop\b|store\b/, /apparel|clothing|fashion/, /jewelry|accessor/, /gift|stationery|book/, /vintage|thrift|consignment/, /home goods|decor|plants?\b|florist/],
  ],
  [
    "Auto services",
    [/auto\b|automotive|car\b|vehicle/, /tire|brake|oil change/, /detailing|car wash|tint/, /mechanic|repair shop|collision|body shop/],
  ],
  [
    "Dental & wellness",
    [/dental|dentist|orthodont/, /invisalign|veneer|whitening/, /chiropract|physical therapy|physio/, /clinic|medical|physician|acupunctur/],
  ],
];

/**
 * The nearest signal vertical for a free-text business identity, or null
 * when nothing matches confidently. An exact vertical name (legacy
 * businesses, the onboarding suggestions) passes straight through.
 */
export function verticalFor(category: string, hints: string[] = []): Category | null {
  if ((CATEGORIES as readonly string[]).includes(category)) return category as Category;
  const text = [category, ...hints].join(" ").toLowerCase();
  let best: { vertical: Category; hits: number } | null = null;
  for (const [vertical, patterns] of VERTICAL_KEYWORDS) {
    const hits = patterns.filter((re) => re.test(text)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { vertical, hits };
  }
  return best?.vertical ?? null;
}

/** Resolver for keyed-map lookups: nearest vertical, else the raw string —
 * so a miss falls into each map's own `?? default` unchanged. */
export function verticalKey(category: string, hints: string[] = []): string {
  return verticalFor(category, hints) ?? category;
}
