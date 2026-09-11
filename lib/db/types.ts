/**
 * Domain row types. Field names mirror the SQL schema in
 * supabase/migrations/ exactly, so the Supabase implementation is a
 * passthrough and the demo store constructs identical shapes.
 */

/** Internal signal VERTICALS — they seed the daily market scan and key the
 * deterministic playbooks (stock terms, concept maps, seasonal moments,
 * content angles). NOT a business identity: `business.category` is free
 * text in the customer's words ("contrast therapy & recovery studio"),
 * bridged to a vertical by lib/signals/vertical.ts where keyed machinery
 * needs it. */
export const CATEGORIES = [
  "Restaurants & cafés",
  "Home services",
  "Health & beauty",
  "Fitness studios",
  "Retail & boutiques",
  "Auto services",
  "Dental & wellness",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type SignalSource =
  | "google_trends"
  | "google_suggest"
  | "reddit"
  | "youtube"
  | "news"
  | "tiktok"
  | "meta_ads"
  | "weather"
  | "dataforseo"
  | "snapshot"
  | "seed";
export type OpportunityStatus = "new" | "accepted" | "dismissed" | "launched";
export type CampaignStatus = "draft" | "exported" | "live" | "complete";
export type CampaignChannel = "meta" | "google" | "tiktok";
export type CreativeKind =
  | "headline"
  | "primary_text"
  | "script"
  | "static_brief"
  | "landing_copy";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  city: string;
  region: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  radius_miles: number;
  website: string | null;
  price_band: string | null;
  brand_voice_notes: string | null;
  /** Photos from their own site, harvested at onboarding. */
  photo_urls: string[];
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  is_active: boolean;
}

export interface Signal {
  id: string;
  source: SignalSource;
  term: string;
  normalized_term: string;
  category: string;
  geo: string;
  metric_type: string;
  value: number | null;
  delta_pct: number | null;
  window_days: number;
  captured_at: string;
  raw: unknown;
}

export interface SignalSeriesPoint {
  id: string;
  normalized_term: string;
  geo: string;
  day: string; // yyyy-mm-dd
  value: number;
}

export interface Opportunity {
  id: string;
  business_id: string;
  signal_id: string;
  week_of: string; // yyyy-mm-dd (Monday)
  score: number;
  rationale: string;
  matched_service_id: string | null;
  competitor_gap: string | null;
  /** The relevance judge's 0–1 fit, when this ranking was judged. Lets
   * screens re-derive the same gated components the stored score used. */
  relevance: number | null;
  status: OpportunityStatus;
  created_at: string;
}

export interface CampaignAudience {
  who: string;
  age_range: string;
  radius_miles: number;
  interests: string[];
  why: string;
  /** Persuasion shape — the key the learnings loop aggregates on. */
  angle_type?: "education" | "offer" | "scarcity" | "social_proof" | "speed" | "novelty";
}

export interface Campaign {
  id: string;
  opportunity_id: string;
  business_id: string;
  angle: string;
  hook: string;
  offer: string;
  audience: CampaignAudience;
  channel: CampaignChannel;
  status: CampaignStatus;
  /** The platform's campaign id once launched through a connected account. */
  external_id: string | null;
  /** Platform-side status at last sync (e.g. PAUSED, ACTIVE). */
  external_status: string | null;
  model_used: string;
  prompt_version: string;
  created_at: string;
}

export interface Creative {
  id: string;
  campaign_id: string;
  kind: CreativeKind;
  content: string;
  variant_index: number;
}

export interface CampaignResult {
  id: string;
  campaign_id: string;
  impressions: number | null;
  clicks: number | null;
  spend_cents: number | null;
  bookings: number | null;
  revenue_cents: number | null;
  ctr: number | null;
  cpa_cents: number | null;
  source: "manual" | "meta_api";
  recorded_at: string;
}

export interface Learning {
  id: string;
  category: string;
  geo_bucket: string;
  angle_type: string;
  lift: number;
  sample_size: number;
  /** 'seed' = illustrative prior; 'measured' = from recorded results. */
  source: "seed" | "measured";
  updated_at: string;
}

export interface BusinessBrief {
  id: string;
  business_id: string;
  /** One paragraph — how this business should be positioned in its market. */
  positioning: string;
  /** 2-4 segments — who actually buys, and why. */
  customer_segments: string[];
  /** One paragraph — local category dynamics: competition, comparisons, demand drivers. */
  market_context: string;
  /** One paragraph — how their real prices sit in the category, and what to lead with. */
  pricing_read: string;
  /** One paragraph — when demand peaks and dips for this category, and how to use it. */
  seasonality: string;
  does_well: string[];
  moat: string;
  advantages: string[];
  watchouts: string[];
  /** 2-4 concrete first campaigns to run, named against real services. */
  first_moves: string[];
  /** 18-30 search phrases this business's customers actually use — the
   * personalized demand watchlist signal ingestion rides. */
  watch_terms: string[];
  /** 12-24 keywords/stems specific to what THIS business sells — the
   * classification vocabulary the fit judge uses beyond the category's
   * stock concept map. Empty on briefs written before brief-5. */
  lexicon: string[];
  /** 3-6 subreddit names (no r/ prefix) where this business's customers
   * actually talk — read alongside the category's stock list. */
  subreddits: string[];
  model_used: string;
  prompt_version: string;
  created_at: string;
}

export type PlanId = "trial" | "baseline" | "pro";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/**
 * One row per business. Every business starts on a 14-day trial; Stripe
 * webhooks move it to a paid plan. The row exists (and the trial clock runs)
 * even before Stripe is configured, so turning billing on later never
 * requires a backfill.
 */
export interface Subscription {
  id: string;
  business_id: string;
  plan: PlanId;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------- connections & intel ------------------------- */

export type ConnectionProvider = "meta" | "google_ads" | "google_business";
export type ConnectionStatus = "connected" | "error" | "revoked";

/** An OAuth link to an external account (ad platform, business profile). */
export interface Connection {
  id: string;
  business_id: string;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  /** Platform account id (e.g. Meta act_… or a Places place_id). */
  account_id: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

/** A named local rival the owner asked TRND to watch. */
export interface Competitor {
  id: string;
  business_id: string;
  name: string;
  website: string | null;
  /** Google Places id once resolved — unlocks rating/review reads. */
  place_id: string | null;
  created_at: string;
}

export type CompetitorReadKind = "ads" | "reviews" | "site";

/** One dated observation about a competitor (ad count, rating, site change). */
export interface CompetitorRead {
  id: string;
  competitor_id: string;
  business_id: string;
  kind: CompetitorReadKind;
  /** ads: active ad count · reviews: review count · site: null */
  value: number | null;
  /** reviews: current star rating. */
  rating: number | null;
  /** One-line human read ("2 new ads since last week"). */
  summary: string;
  raw: unknown;
  captured_at: string;
}

/** A customer review — the business's own (competitor_id null) or a rival's. */
export interface Review {
  id: string;
  business_id: string;
  competitor_id: string | null;
  author: string;
  rating: number;
  text: string;
  published_at: string | null;
  source: "google" | "seed";
  captured_at: string;
}

/** Mined themes from the business's own reviews — regenerates as reviews land. */
export interface ReviewDigest {
  id: string;
  business_id: string;
  review_count: number;
  /** What customers consistently praise. */
  themes: string[];
  /** Phrases customers actually use — ready-made ad copy hooks. */
  copy_hooks: string[];
  /** Recurring complaints — what ads must not overpromise. */
  watchouts: string[];
  model_used: string;
  created_at: string;
}

export type AlertKind =
  | "demand_spike"
  | "competitor_ads"
  | "seasonal_window"
  | "campaign_performance"
  | "report_ready";

/** A proactive nudge — TRND noticed something the owner didn't ask about. */
export interface Alert {
  id: string;
  business_id: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** In-app destination for the alert. */
  href: string;
  /** Stable key so re-evaluation never duplicates an alert. */
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

export interface DemoRequest {
  id: string;
  full_name: string;
  email: string;
  business_name: string;
  /** Free-text identity in the customer's words, like business.category. */
  category: string | null;
  /** Their site — the pre-call sample gets built from it. */
  website: string | null;
  monthly_spend: string | null;
  created_at: string;
}

/* ------------------------------ insert shapes ------------------------------ */

export type NewBusiness = Omit<Business, "id" | "created_at">;
export type NewService = Omit<Service, "id">;
/**
 * The analyst note that opens a week's intel report — the one AI-written (or
 * deterministic-fallback) block on an otherwise fully data-derived page.
 * Persisted per (business, week) so the report is stable within a week.
 */
export interface IntelNote {
  id: string;
  business_id: string;
  week_of: string; // yyyy-mm-dd (Monday)
  /** One-sentence verdict for the week. */
  headline: string;
  /** 2-3 short analyst paragraphs. */
  narrative: string[];
  /** 2-4 concrete do-this items. */
  actions: string[];
  model_used: string;
  prompt_version: string;
  created_at: string;
}
export type NewIntelNote = Omit<IntelNote, "id" | "created_at">;

/**
 * The read on one pick — the analyst's paragraphs on why this term, for this
 * business, this week, written from the same facts the score meters show.
 * Model-written only; without a model the deterministic insight lines stand
 * alone. One per opportunity, regenerated when its facts move.
 */
export interface PickRead {
  id: string;
  opportunity_id: string;
  business_id: string;
  /** 2-3 short paragraphs: the verdict first, then the why. */
  paragraphs: string[];
  /** 2-3 questions the owner would naturally ask next about this pick. */
  questions: string[];
  model_used: string;
  /** Prompt version + a fingerprint of the facts it was written from. */
  prompt_version: string;
  created_at: string;
}
export type NewPickRead = Omit<PickRead, "id" | "created_at">;

/**
 * A question the owner wants answered every week — "who is advertising
 * against me?", "is my facial priced right for Atlanta?" — re-answered
 * each Monday against that week's facts and memory, with what moved since
 * the last answer. The evergreen loop: the question never closes.
 */
export interface StandingQuestion {
  id: string;
  business_id: string;
  question: string;
  active: boolean;
  /** The latest answer, 1-4 short paragraphs; empty until first answered. */
  answer: string[];
  /** One sentence on what moved since the previous answer; null the first time. */
  changed: string | null;
  /** The week (Monday) the latest answer was written for. */
  answered_week: string | null;
  previous_answer: string[];
  model_used: string | null;
  created_at: string;
}
export type NewStandingQuestion = Pick<StandingQuestion, "business_id" | "question">;

export type DocumentKind = "menu" | "sales" | "reviews" | "brand" | "results" | "other";

/** What TRND took from one uploaded document — the facts an analyst may
 * cite, and the menu items it found, if any. */
export interface DocumentDigest {
  kind: DocumentKind;
  summary: string;
  facts: string[];
  services_found: { name: string; price_cents: number | null }[];
  watchouts: string[];
}

/**
 * The owner's own knowledge, next to the market's: a menu PDF, a sales
 * export, a brand guide, last quarter's ad results. The raw file is never
 * kept — its text is extracted on upload (by the model for PDFs) and
 * digested into facts that ride on every read, answer and note.
 */
export interface BusinessDocument {
  id: string;
  business_id: string;
  name: string;
  mime: string;
  bytes: number;
  /** Extracted text, capped; empty when nothing could be read. */
  text: string;
  digest: DocumentDigest;
  model_used: string;
  created_at: string;
}
export type NewBusinessDocument = Omit<BusinessDocument, "id" | "created_at">;

/**
 * A public demand snapshot: what TRND could say about a business from its
 * website alone, kept so the link stays shareable. Owned by nobody — it is
 * generated before anyone signs up, readable by anyone holding the token,
 * and holds only what was already public on the business's own site plus
 * measurements anyone could take.
 */
export interface PublicSnapshot {
  id: string;
  /** URL-safe random token — the only thing that addresses this row. */
  token: string;
  /** Hostname it was built for, so a repeat ask reuses a fresh one. */
  host: string;
  url: string;
  business_name: string;
  /** The assembled DemandSnapshot (lib/preview/types.ts). */
  payload: unknown;
  created_at: string;
}
export type NewPublicSnapshot = Omit<PublicSnapshot, "id" | "created_at">;

export type NewSignal = Omit<Signal, "id" | "captured_at"> & { captured_at?: string };
export type NewSeriesPoint = Omit<SignalSeriesPoint, "id">;
export type NewOpportunity = Omit<Opportunity, "id" | "created_at" | "status"> & {
  status?: OpportunityStatus;
};
export type NewCampaign = Omit<Campaign, "id" | "created_at" | "status" | "external_id" | "external_status"> & {
  status?: CampaignStatus;
  external_id?: string | null;
  external_status?: string | null;
};
export type NewCreative = Omit<Creative, "id">;
export type NewCampaignResult = Omit<CampaignResult, "id" | "recorded_at">;
export type NewLearning = Omit<Learning, "id" | "updated_at">;
export type NewBusinessBrief = Omit<BusinessBrief, "id" | "created_at">;
export type NewDemoRequest = Omit<DemoRequest, "id" | "created_at">;
export type NewSubscription = Omit<Subscription, "id" | "created_at" | "updated_at">;
export type NewConnection = Omit<Connection, "id" | "created_at" | "updated_at">;
export type NewCompetitor = Omit<Competitor, "id" | "created_at">;
export type NewCompetitorRead = Omit<CompetitorRead, "id" | "captured_at"> & { captured_at?: string };
export type NewReview = Omit<Review, "id" | "captured_at">;
export type NewReviewDigest = Omit<ReviewDigest, "id" | "created_at">;
export type NewAlert = Omit<Alert, "id" | "created_at" | "read_at">;
