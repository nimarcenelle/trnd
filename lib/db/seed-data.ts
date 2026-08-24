import { normalizeTerm } from "@/lib/signals/normalize";

import type { NewLearning, NewSeriesPoint, NewSignal } from "./types";

/**
 * Illustrative seed signal set — ~60 rows across all seven launch categories.
 * Flagged source='seed' and rendered with an "illustrative" marker in the UI.
 * Series are generated deterministically per term so re-seeding is stable.
 */

interface SeedTerm {
  term: string;
  category: string;
  metric_type: string;
  delta_pct: number;
  value: number;
  geo?: string;
}

export const SEED_TERMS: SeedTerm[] = [
  // Restaurants & cafés
  { term: "weekend brunch reservations", category: "Restaurants & cafés", metric_type: "local_demand", delta_pct: 22, value: 68 },
  { term: "iced latte alternatives", category: "Restaurants & cafés", metric_type: "search_interest", delta_pct: 34, value: 74 },
  { term: "matcha drinks near me", category: "Restaurants & cafés", metric_type: "search_interest", delta_pct: 41, value: 62 },
  { term: "late night eats", category: "Restaurants & cafés", metric_type: "conversation", delta_pct: 18, value: 55 },
  { term: "prix fixe date night", category: "Restaurants & cafés", metric_type: "booking_intent", delta_pct: 26, value: 47 },
  { term: "gluten free bakery", category: "Restaurants & cafés", metric_type: "search_interest", delta_pct: 15, value: 58 },
  { term: "patio dining", category: "Restaurants & cafés", metric_type: "local_demand", delta_pct: 29, value: 71 },
  { term: "family style takeout", category: "Restaurants & cafés", metric_type: "conversation", delta_pct: 12, value: 44 },
  { term: "espresso martini flights", category: "Restaurants & cafés", metric_type: "conversation", delta_pct: 48, value: 52 },

  // Home services
  { term: "same-day appointments", category: "Home services", metric_type: "booking_intent", delta_pct: 27, value: 66 },
  { term: "ac tune up before summer", category: "Home services", metric_type: "search_interest", delta_pct: 38, value: 72 },
  { term: "gutter cleaning fall", category: "Home services", metric_type: "search_interest", delta_pct: 21, value: 54 },
  { term: "emergency plumber near me", category: "Home services", metric_type: "search_interest", delta_pct: 9, value: 81 },
  { term: "smart thermostat install", category: "Home services", metric_type: "conversation", delta_pct: 31, value: 49 },
  { term: "house deep clean move out", category: "Home services", metric_type: "booking_intent", delta_pct: 24, value: 57 },
  { term: "handyman weekend availability", category: "Home services", metric_type: "booking_intent", delta_pct: 17, value: 51 },
  { term: "pressure washing driveway", category: "Home services", metric_type: "search_interest", delta_pct: 33, value: 60 },

  // Health & beauty
  { term: "facial balancing", category: "Health & beauty", metric_type: "conversation", delta_pct: 38, value: 77 },
  { term: "skin barrier repair", category: "Health & beauty", metric_type: "conversation", delta_pct: 51, value: 83 },
  { term: "brow lamination", category: "Health & beauty", metric_type: "search_interest", delta_pct: 23, value: 59 },
  { term: "lip flip vs filler", category: "Health & beauty", metric_type: "search_interest", delta_pct: 35, value: 64 },
  { term: "hydrafacial deals", category: "Health & beauty", metric_type: "search_interest", delta_pct: 19, value: 56 },
  { term: "mens skincare routine", category: "Health & beauty", metric_type: "conversation", delta_pct: 28, value: 61 },
  { term: "scalp treatment", category: "Health & beauty", metric_type: "search_interest", delta_pct: 44, value: 69 },
  { term: "bridal makeup trial", category: "Health & beauty", metric_type: "booking_intent", delta_pct: 26, value: 48 },
  { term: "korean glass skin facial", category: "Health & beauty", metric_type: "conversation", delta_pct: 47, value: 73 },

  // Fitness studios
  { term: "recovery and wellness add-ons", category: "Fitness studios", metric_type: "conversation", delta_pct: 48, value: 70 },
  { term: "reformer pilates intro", category: "Fitness studios", metric_type: "search_interest", delta_pct: 42, value: 76 },
  { term: "cold plunge membership", category: "Fitness studios", metric_type: "conversation", delta_pct: 39, value: 63 },
  { term: "strength training for women", category: "Fitness studios", metric_type: "search_interest", delta_pct: 31, value: 79 },
  { term: "run club near me", category: "Fitness studios", metric_type: "local_demand", delta_pct: 36, value: 58 },
  { term: "couples workout classes", category: "Fitness studios", metric_type: "search_interest", delta_pct: 14, value: 42 },
  { term: "new year small group training", category: "Fitness studios", metric_type: "booking_intent", delta_pct: 22, value: 53 },
  { term: "mobility class beginners", category: "Fitness studios", metric_type: "search_interest", delta_pct: 25, value: 50 },

  // Retail & boutiques
  { term: "quiet luxury basics", category: "Retail & boutiques", metric_type: "conversation", delta_pct: 27, value: 65 },
  { term: "local gift shop finds", category: "Retail & boutiques", metric_type: "local_demand", delta_pct: 18, value: 52 },
  { term: "linen summer sets", category: "Retail & boutiques", metric_type: "search_interest", delta_pct: 37, value: 67 },
  { term: "vintage denim fit", category: "Retail & boutiques", metric_type: "conversation", delta_pct: 24, value: 57 },
  { term: "teacher gift ideas", category: "Retail & boutiques", metric_type: "search_interest", delta_pct: 45, value: 61 },
  { term: "candle making kits", category: "Retail & boutiques", metric_type: "search_interest", delta_pct: 16, value: 43 },
  { term: "gameday outfit local", category: "Retail & boutiques", metric_type: "local_demand", delta_pct: 30, value: 55 },
  { term: "sustainable jewelry brands", category: "Retail & boutiques", metric_type: "conversation", delta_pct: 21, value: 49 },

  // Auto services
  { term: "ceramic coating worth it", category: "Auto services", metric_type: "search_interest", delta_pct: 33, value: 66 },
  { term: "mobile detailing near me", category: "Auto services", metric_type: "search_interest", delta_pct: 40, value: 71 },
  { term: "ev tire wear", category: "Auto services", metric_type: "conversation", delta_pct: 29, value: 54 },
  { term: "winter tire swap booking", category: "Auto services", metric_type: "booking_intent", delta_pct: 23, value: 59 },
  { term: "windshield chip repair", category: "Auto services", metric_type: "search_interest", delta_pct: 12, value: 48 },
  { term: "fleet oil change plans", category: "Auto services", metric_type: "search_interest", delta_pct: 17, value: 41 },
  { term: "headlight restoration", category: "Auto services", metric_type: "search_interest", delta_pct: 26, value: 45 },
  { term: "paint protection film cost", category: "Auto services", metric_type: "search_interest", delta_pct: 35, value: 62 },

  // Dental & wellness
  { term: "invisalign open house", category: "Dental & wellness", metric_type: "booking_intent", delta_pct: 28, value: 60 },
  { term: "teeth whitening before wedding", category: "Dental & wellness", metric_type: "search_interest", delta_pct: 36, value: 65 },
  { term: "veneers cost", category: "Dental & wellness", metric_type: "search_interest", delta_pct: 20, value: 72 },
  { term: "sleep apnea dentist", category: "Dental & wellness", metric_type: "search_interest", delta_pct: 32, value: 57 },
  { term: "iv hydration therapy", category: "Dental & wellness", metric_type: "conversation", delta_pct: 43, value: 68 },
  { term: "same day crown", category: "Dental & wellness", metric_type: "search_interest", delta_pct: 15, value: 46 },
  { term: "kids first dental visit", category: "Dental & wellness", metric_type: "booking_intent", delta_pct: 19, value: 50 },
  { term: "gum contouring", category: "Dental & wellness", metric_type: "search_interest", delta_pct: 24, value: 44 },
];

/* Deterministic PRNG so seeded sparklines are stable run to run. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 30 daily points ending today, trending so the last week reflects delta_pct. */
export function buildSeries(term: SeedTerm, endDate = new Date()): NewSeriesPoint[] {
  const rand = mulberry32(hashString(term.term));
  const points: NewSeriesPoint[] = [];
  const normalized = normalizeTerm(term.term);
  const end = term.value;
  const start = Math.max(5, end / (1 + term.delta_pct / 100));
  for (let i = 29; i >= 0; i--) {
    const day = new Date(endDate.getTime() - i * 86400_000).toISOString().slice(0, 10);
    const progress = (29 - i) / 29;
    // Ease-in rise plus deterministic noise.
    const base = start + (end - start) * progress * progress;
    const noise = (rand() - 0.5) * (end - start) * 0.18;
    points.push({
      normalized_term: normalized,
      geo: term.geo ?? "US",
      day,
      value: Math.max(1, Math.round((base + noise) * 10) / 10),
    });
  }
  return points;
}

export function buildSeedSignals(capturedAt = new Date()): NewSignal[] {
  return SEED_TERMS.map((t) => ({
    source: "seed" as const,
    term: t.term,
    normalized_term: normalizeTerm(t.term),
    category: t.category,
    geo: t.geo ?? "US",
    metric_type: t.metric_type,
    value: t.value,
    delta_pct: t.delta_pct,
    window_days: 7,
    captured_at: capturedAt.toISOString(),
    raw: { seeded: true },
  }));
}

/** A few neutral-ish priors so historical_lift has something to read. */
export const SEED_LEARNINGS: NewLearning[] = [
  { category: "Health & beauty", geo_bucket: "US", angle_type: "education", lift: 0.72, sample_size: 14 },
  { category: "Health & beauty", geo_bucket: "US", angle_type: "offer", lift: 0.58, sample_size: 11 },
  { category: "Restaurants & cafés", geo_bucket: "US", angle_type: "scarcity", lift: 0.66, sample_size: 9 },
  { category: "Fitness studios", geo_bucket: "US", angle_type: "social_proof", lift: 0.61, sample_size: 8 },
  { category: "Home services", geo_bucket: "US", angle_type: "speed", lift: 0.69, sample_size: 12 },
  { category: "Dental & wellness", geo_bucket: "US", angle_type: "education", lift: 0.64, sample_size: 7 },
  { category: "Auto services", geo_bucket: "US", angle_type: "offer", lift: 0.57, sample_size: 6 },
  { category: "Retail & boutiques", geo_bucket: "US", angle_type: "novelty", lift: 0.6, sample_size: 5 },
];
