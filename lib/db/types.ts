/**
 * Domain row types. Field names mirror the SQL schema in
 * supabase/migrations/ exactly, so the Supabase implementation is a
 * passthrough and the demo store constructs identical shapes.
 */

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
  | "reddit"
  | "youtube"
  | "news"
  | "tiktok"
  | "meta_ads"
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
  /** 5-8 search phrases this business's customers actually use — the
   * personalized demand watchlist signal ingestion rides. */
  watch_terms: string[];
  model_used: string;
  prompt_version: string;
  created_at: string;
}

export interface DemoRequest {
  id: string;
  full_name: string;
  email: string;
  business_name: string;
  category: string | null;
  monthly_spend: string | null;
  created_at: string;
}

/* ------------------------------ insert shapes ------------------------------ */

export type NewBusiness = Omit<Business, "id" | "created_at">;
export type NewService = Omit<Service, "id">;
export type NewSignal = Omit<Signal, "id" | "captured_at"> & { captured_at?: string };
export type NewSeriesPoint = Omit<SignalSeriesPoint, "id">;
export type NewOpportunity = Omit<Opportunity, "id" | "created_at" | "status"> & {
  status?: OpportunityStatus;
};
export type NewCampaign = Omit<Campaign, "id" | "created_at" | "status"> & {
  status?: CampaignStatus;
};
export type NewCreative = Omit<Creative, "id">;
export type NewCampaignResult = Omit<CampaignResult, "id" | "recorded_at">;
export type NewLearning = Omit<Learning, "id" | "updated_at">;
export type NewBusinessBrief = Omit<BusinessBrief, "id" | "created_at">;
export type NewDemoRequest = Omit<DemoRequest, "id" | "created_at">;
