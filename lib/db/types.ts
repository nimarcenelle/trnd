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

export type SignalSource = "google_trends" | "reddit" | "youtube" | "news" | "seed";
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
  updated_at: string;
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
export type NewDemoRequest = Omit<DemoRequest, "id" | "created_at">;
