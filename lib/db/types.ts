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
  | "x"
  | "instagram"
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

export type SocialPlatform = "instagram" | "tiktok" | "facebook";
/** Public handles, no @ — {"instagram": "bellwoodcoffee"}. Read from the
 * site footer at onboarding (or a rival's site), editable in Settings. */
export type SocialHandles = Partial<Record<SocialPlatform, string>>;

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
  /** Their own accounts — the brand half of the social read. */
  social_handles: SocialHandles;
  /** "online": a brand selling nationally online (the DTC customer), whose
   * rivals are competing brands and whose demand is read nationally.
   * "local": a place with a radius, whose rivals are nearby places. */
  market: BusinessMarket;
  /** Monthly paid social spend band, e.g. "20-50k". Null when not given. */
  monthly_ad_spend: string | null;
  /** Where they run ads: meta, tiktok, google, youtube, pinterest, snapchat. */
  ad_platforms: AdPlatform[];
  /** What the brand's campaigns optimize for. A brand may run more than one
   * campaign type at once (purchases and leads, say). Empty when never asked. */
  campaign_objectives?: CampaignObjective[];
  /** What the brand can actually produce: talking head, UGC, demo, static... */
  production_formats?: ProductionFormat[];
  /** Claims the brand may and may not make, in the owner's words. */
  claims_notes?: string | null;
  /** What the brand shot recently, so a brief can say how it differs. */
  recent_creative_notes?: string | null;
  /** The product or offer the brand wants briefs to lead with. */
  priority_service_id?: string | null;
  created_at: string;
}

export type CampaignObjective = "purchases" | "leads" | "traffic" | "awareness";
export const CAMPAIGN_OBJECTIVES: readonly CampaignObjective[] = ["purchases", "leads", "traffic", "awareness"];
export type ProductionFormat = "talking_head" | "ugc" | "demo" | "static" | "editor" | "studio";
export const PRODUCTION_FORMATS: readonly ProductionFormat[] = ["talking_head", "ugc", "demo", "static", "editor", "studio"];

export type BusinessMarket = "online" | "local";
export type AdPlatform = "meta" | "tiktok" | "google" | "youtube" | "pinterest" | "snapchat";
export const AD_SPEND_BANDS = ["under-20k", "20-50k", "50-100k", "100-250k", "250k-plus"] as const;
export type AdSpendBand = (typeof AD_SPEND_BANDS)[number];

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  is_active: boolean;
  /** From the store's public catalog, refreshed daily. Null means never read. */
  in_stock?: boolean | null;
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
  /** The Opportunity Grade (lib/scoring/model.ts); null on rows ranked
   * before the four-signal model or before migration 0024. */
  grade?: string | null;
  grade_score?: number | null;
  signal_scores?: Record<string, unknown> | null;
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

/**
 * The ONE customer the ads are for. Customer signals are not every signal
 * in the category — they are what THIS person is searching, saying and
 * reacting to, and a term is judged against their vocabulary before it can
 * count as demand.
 */
export interface TargetCustomer {
  /** One sentence: who they are and the situation they buy from. */
  who: string;
  /** The moments that trigger the purchase ("first hot week", "date night"). */
  triggers: string[];
  /** The words THEY use for what the business sells — 10-20 lowercase
   * phrases; signal terms are matched against these. */
  vocabulary: string[];
  /** Where they talk and look: subreddits, hashtags, local pages. */
  hangouts: string[];
  /** Why they don't buy — the objections the copy must answer. */
  objections: string[];
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
  /** The target customer — null (or an empty object from the DB default)
   * on briefs written before brief-7; read it through `targetCustomerOf`. */
  target_customer: TargetCustomer | null;
  model_used: string;
  prompt_version: string;
  created_at: string;
}

/** trial: the 14-day trial (baseline limits). starter, baseline, pro: the
 * three plans on access (lib/billing). "baseline" is the pilot tier. */
export type PlanId = "trial" | "starter" | "baseline" | "pro";
export const PAID_PLANS: readonly Exclude<PlanId, "trial">[] = ["starter", "baseline", "pro"];
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
  /** Their public accounts, read from their site — the competitive half
   * of the social read. */
  social_handles: SocialHandles;
  /** 0..1 — how directly they compete for the same customer: same items,
   * same price band, same block. Null until their site has been read. */
  directness: number | null;
  directness_reason: string | null;
  created_at: string;
}

export type CompetitorReadKind = "ads" | "reviews" | "site" | "social" | "google_ads";

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
  /** google: Places (local). trustpilot: an online brand or rival's Trustpilot
   * page. site: reviews a rival publishes as structured data on its own pages. */
  source: "google" | "seed" | "trustpilot" | "site";
  captured_at: string;
}

/** A comment under a post the brand (competitor_id null) or a rival published:
 * what customers write, in their own words, under the thing they were shown. */
export interface SocialComment {
  id: string;
  business_id: string;
  competitor_id: string | null;
  platform: SocialPlatform;
  /** The post's external id as social_posts stores it. */
  post_external_id: string;
  external_id: string;
  author: string;
  text: string;
  likes: number;
  posted_at: string | null;
  captured_at: string;
}

/** One model call's tokens, by brand and by the job that made it. */
export interface AiUsage {
  id: string;
  business_id: string | null;
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export type SocialPostKind = "promo" | "new_item" | "event" | "behind_scenes" | "proof" | "other";

/**
 * One public post from the business's own account (competitor_id null) or a
 * rival's. Engagement is the performance read — likes, comments, shares and
 * views are what a public profile shows; there is no other honest number.
 */
export interface SocialPost {
  id: string;
  business_id: string;
  competitor_id: string | null;
  platform: SocialPlatform;
  external_id: string;
  url: string;
  caption: string;
  media_type: "video" | "image" | "carousel" | "text";
  posted_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  /** True when the platform marks it sponsored/boosted. */
  is_ad: boolean;
  /** What the post is doing — classified after capture; null until then. */
  kind: SocialPostKind | null;
  captured_at: string;
}

export type AdHistorySource = "meta_export" | "google_export" | "manual" | "meta_api";

/**
 * The owner's own ad history — one row per ad (or campaign when the export
 * has no ad breakdown). The brand signal's "what has worked for YOU":
 * an Ads Manager export, a synced account, or a hand entry.
 */
export interface AdHistory {
  id: string;
  business_id: string;
  platform: "meta" | "google" | "tiktok" | "other";
  campaign_name: string;
  ad_name: string | null;
  /** The ad's text when the export carried it (headline / body). */
  copy: string | null;
  impressions: number | null;
  clicks: number | null;
  spend_cents: number | null;
  /** Platform "results" (leads, purchases, messages) when reported. */
  results: number | null;
  ctr: number | null;
  started_on: string | null; // yyyy-mm-dd
  ended_on: string | null;
  source: AdHistorySource;
  /** The platform's own ad id when the row was synced (migration 0032). */
  external_ad_id?: string | null;
  /** Purchases and their value, apart from the platform's generic "results". */
  purchases?: number | null;
  purchase_value_cents?: number | null;
  /** Video delivery: 3-second plays (the hook) and ThruPlays (the hold). */
  video_3s_views?: number | null;
  thruplays?: number | null;
  /** A thumbnail or image of the creative, when the platform gave one. */
  creative_url?: string | null;
  creative_kind?: "video" | "image" | "carousel" | null;
  /** The creative test this ad is linked to by the owner (pick_runs.id). */
  run_id?: string | null;
  /** How the ad is built, classified once from its copy and creative
   * (lib/ads/classify.ts, migration 0033): the persuasion angle, the kind
   * of opening, and the production format. Null until classified. */
  angle?: AdAngle | null;
  hook_type?: HookType | null;
  format?: AdFormat | null;
  /** The classifier that wrote the three: a model id or "trnd-rules/1". */
  classifier?: string | null;
  created_at: string;
}

export type AdAngle = "education" | "offer" | "scarcity" | "social_proof" | "speed" | "novelty";
export const AD_ANGLES: readonly AdAngle[] = ["education", "offer", "scarcity", "social_proof", "speed", "novelty"];
export type HookType = "question" | "problem" | "claim" | "story" | "comparison" | "callout" | "demonstration" | "offer" | "other";
export const HOOK_TYPES: readonly HookType[] = ["question", "problem", "claim", "story", "comparison", "callout", "demonstration", "offer", "other"];
export type AdFormat = "talking_head" | "ugc" | "demo" | "static" | "editor" | "studio" | "carousel" | "video" | "unknown";
export const AD_FORMATS: readonly AdFormat[] = ["talking_head", "ugc", "demo", "static", "editor", "studio", "carousel", "video", "unknown"];

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

/* ---------------------------------- picks ---------------------------------- */

export type PickStatus = "draft" | "ready" | "published";
export type PickSignal = "customer" | "culture" | "competitive" | "brand";
export type PickMetricWindow = "week" | "30d";
export type PickDismissReason = "wrong_customer" | "already_tried" | "off_brand" | "cant_shoot" | "not_now" | "other";
/** planned: chosen for production, nothing live. running: launched. */
export type PickRunStatus = "planned" | "running" | "completed" | "killed";
/** running: launched from the pick. dismissed: passed on. chosen: picked
 * for production. refined: rewritten on the owner's direction. */
export type PickFeedbackAction = "running" | "dismissed" | "chosen" | "refined";
export type PickEvidenceKind = "observation" | "quote" | "measurement" | "context";
export type PickBasis = "builds_on" | "explores";

/**
 * A creative test: the concept a brand hands to a creator, stored whole on
 * the pick (migration 0028). The search term the concept was found through
 * stays on the pick as the research input. Everything here that is a
 * judgment is written by the model and labeled a hypothesis on the page;
 * everything that is a fact is checked against the catalog and the
 * evidence rows before it is stored.
 */
export interface CreativeBrief {
  version: string;
  /** The customer situation, problem or objection the concept speaks to. */
  situation: string;
  /** What we believe may improve response, and why. A hypothesis. */
  hypothesis: string;
  /** What is uncertain or missing. Code adds the structural gaps. */
  unknowns: string[];
  /** How this differs from the brand's recent creative, or what we could not compare against. */
  differs_from: string;
  /** The format the script is written for: "20-second talking head". */
  format: string;
  hooks: { primary: string; alternatives: string[] };
  script: { direction: PickDirection; cta: string; duration_seconds: number };
  /** Shots, demonstrations and assets the creator needs. */
  shot_list: string[];
  /** The product facts and claims the brief uses. Each is checked against the catalog. */
  approved_facts: string[];
  /** The qualified plan for judging the test. Computed by code from the brand's context. */
  evaluation: EvaluationPlan;
  /** What each outcome would teach. */
  outcomes: { if_better: string; if_same: string; if_worse: string };
  /** How the brand's own past ads of this shape did, computed by code from
   * its ad history. Null when there is no history to read. */
  lineage?: ConceptLineage | null;
  /** The previous brief when this one is a refinement, so nothing is lost. */
  refined_from?: { at: string; ask: string; brief: Omit<CreativeBrief, "refined_from"> } | null;
  /** The first three seconds, shot by shot: the one part of the ad the brief
   * dictates rather than directs. The first beat's voice line is the hook,
   * word for word. Null on briefs written before ct-2. */
  opening?: { beats: PickBeat[] } | null;
}

/**
 * The concept graded against the brand's own record: its last few ads built
 * the same way (lib/ads/history-read.ts classifies the shape), and how many
 * of them beat the account's click-through. The line the page prints is
 * written by code from these numbers, never by the model.
 */
export interface ConceptLineage {
  /** The ad theme the concept was classified as (education, offer, ...). */
  theme: string;
  /** How many past ads of that shape were compared, at most three. */
  ads: number;
  /** How many of them beat the account click-through. */
  beat: number;
  /** "2 of your last 3 ads built on explaining something beat your account click-through." */
  line: string;
  /** yyyy-mm-dd the most recent of them started, when known. */
  latest: string | null;
}

/**
 * How to judge the test: never a universal threshold. Built from the
 * campaign objective, the account's own baseline when one is on file,
 * the spend band and how many conversions the window can hold.
 */
export interface EvaluationPlan {
  /** Every objective the brand's campaigns buy; empty when not set. */
  objectives: CampaignObjective[];
  /** What to compare against: the brand's current best on the same objective. */
  comparison: string;
  /** Suggested test budget and window, from the spend band. */
  budget: string;
  /** What to watch, in order. */
  watch: string[];
  /** Why the numbers may mislead here. */
  caveats: string[];
  /** What TRND needs before it can say more. */
  missing: string[];
}
/** The owner's own call on a finished run. Null when only the numbers speak. */
export type RunVerdict = "won" | "lost";

/** One beat of a script: what the camera sees, what is on screen, what is said. */
export interface PickBeat {
  visual: string;
  on_screen_text: string;
  vo: string;
}

/**
 * A week's pick, written whole by the weekly job: the finding (the mismatch
 * between the customer's words and the brand's), exactly one metric, the bet
 * with its kill rule, and an optional guardrail. Named BrandPick because
 * TypeScript already owns `Pick`.
 */
export interface BrandPick {
  id: string;
  business_id: string;
  opportunity_id: string | null;
  week_of: string; // yyyy-mm-dd (Monday)
  rank: number; // 1..5
  geo: string;
  term: string;
  finding: string;
  metric_label: string;
  metric_value: number | null;
  metric_delta_pct: number | null;
  metric_window: PickMetricWindow;
  sparkline: { d: string; v: number }[];
  bet_what: string;
  bet_budget_usd: number;
  bet_duration_days: number;
  bet_kill_rule: string;
  guardrail: string | null;
  /** The Opportunity Grade when the pick was written; see lib/scoring/model.ts. */
  grade?: string | null;
  grade_score?: number | null;
  signal_scores?: Record<string, unknown> | null;
  /** The concept's title, when the pick is a creative test (0028). Null on keyword picks. */
  concept_title?: string | null;
  brief?: CreativeBrief | null;
  brief_version?: string | null;
  /** Whether the concept builds on something the brand already ran, or explores new ground. */
  basis?: PickBasis | null;
  /** Why this concept sits where it does this week. */
  priority_reason?: string | null;
  /** The token /share/<token> reads the brief by, without an account (0034). */
  share_token?: string | null;
  status: PickStatus;
  created_at: string;
}

export interface PickEvidence {
  id: string;
  pick_id: string;
  signal: PickSignal;
  claim: string;
  source_url: string | null;
  source_label: string | null;
  position: number;
  /** What kind of row this is; "observation" on rows written before 0028. */
  kind?: PickEvidenceKind | null;
  /** yyyy-mm-dd the observation was made, when known. */
  observed_on?: string | null;
  /** How many things the row counts, when it counts something. */
  sample_size?: number | null;
  /** What the row cannot say. */
  limitation?: string | null;
}

/**
 * Direction for a script: guidance a creator interprets, never lines to
 * read. The hook is the only verbatim line a pick carries. A shot list with
 * voiceover dictated the ad, and an ad that fails is then TRND's ad.
 */
export interface PickDirection {
  /** What the video should show: setting, the item in use, what to avoid. */
  show: string;
  /** The argument to make, in the creator's own words. */
  say: string;
  /** The one claim to back up, and with what; or what not to claim. */
  prove: string;
}

export interface PickScript {
  id: string;
  pick_id: string;
  position: number;
  variant_label: string;
  thesis: string;
  hook: string;
  /** Shot list from picks written before direction existed; empty on new picks. */
  beats: PickBeat[];
  /** Null on picks written before direction existed. */
  direction: PickDirection | null;
  cta: string;
  duration_seconds: number;
}

export interface PickFeedback {
  id: string;
  pick_id: string;
  business_id: string;
  user_id: string | null;
  action: PickFeedbackAction;
  reason: PickDismissReason | null;
  note: string | null;
  created_at: string;
}

export interface PickRun {
  id: string;
  pick_id: string;
  business_id: string;
  status: PickRunStatus;
  started_at: string;
  ended_at: string | null;
  spend_usd: number | null;
  /** Real results, entered or synced; they feed the brand's own baseline. */
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  revenue_usd?: number | null;
  result_note: string | null;
  /** The owner's verdict on the run, when they gave one (migration 0026). */
  verdict?: RunVerdict | null;
  /** When the test went live; null while only planned (0028). */
  launched_at?: string | null;
  /** What the test taught, in the owner's words, apart from the numbers (0028). */
  learned?: string | null;
  /** The account's click-through the run was judged against when it ended,
   * frozen so the comparison never drifts (0029). */
  baseline_ctr?: number | null;
  /** The run's click-through over baseline_ctr: 1.3 means 30% above (0029). */
  lift?: number | null;
  /** The platform campaign id when the run was launched through a connected
   * account; the daily sync writes its numbers back by it. */
  meta_campaign_id: string | null;
  /** How closely the finished ad followed the brief, 0 to 1, and the read
   * behind it (lib/picks/fidelity.ts, migration 0033). Null until checked. */
  fidelity_score?: number | null;
  fidelity_read?: FidelityRead | null;
}

/** The finished ad checked against its brief: each line is yes, no, or
 * could not tell. The score is the share of the checks that could be made
 * that came back yes. */
export interface FidelityRead {
  version: string;
  hook_present: boolean | null;
  opening_followed: boolean | null;
  facts_only: boolean | null;
  format_matches: boolean | null;
  notes: string[];
  /** "pasted": the owner pasted the ad's words. "linked": read from the linked ad's copy. */
  source: "pasted" | "linked";
  checked_at: string;
  model: string;
}

/** Why a week held a term instead of picking it (migration 0026). */
export type WeekSkipKind = "hold" | "memory" | "fit";

export interface WeekSkip {
  id: string;
  business_id: string;
  week_of: string; // yyyy-mm-dd (Monday)
  term: string;
  normalized_term: string;
  kind: WeekSkipKind;
  /** One owner-readable line: "You ran this and killed it on Sep 2". */
  reason: string;
  grade: string | null;
  grade_score: number | null;
  created_at: string;
}
export type NewWeekSkip = Omit<WeekSkip, "id" | "business_id" | "week_of" | "created_at">;

/** What the weekly job hands the database for one pick. */
export interface NewPickBundle {
  pick: Omit<BrandPick, "id" | "business_id" | "week_of" | "created_at">;
  evidence: Omit<PickEvidence, "id" | "pick_id" | "position">[];
  scripts: Omit<PickScript, "id" | "pick_id" | "position">[];
}

/** A pick with everything the detail page renders, read in one go. */
export interface PickDetail {
  pick: BrandPick;
  evidence: PickEvidence[];
  scripts: PickScript[];
  run: PickRun | null;
  dismissed: boolean;
}

/** One raw signal reading, kept 90 days as the baseline percentiles rank against. */
export interface SignalReading {
  id: string;
  business_id: string;
  captured_on: string; // yyyy-mm-dd
  signal: "customer" | "culture" | "competitive" | "brand";
  term: string;
  reading: Record<string, number | null>;
}
export type NewSignalReading = Omit<SignalReading, "id" | "captured_on"> & { captured_on?: string };

export type NewPickFeedback = Omit<PickFeedback, "id" | "created_at">;
export type NewPickRun = Omit<PickRun, "id" | "started_at" | "ended_at" | "spend_usd" | "result_note" | "meta_campaign_id"> &
  Partial<Pick<PickRun, "started_at" | "ended_at" | "spend_usd" | "result_note" | "meta_campaign_id">>;

/* ------------------------------ insert shapes ------------------------------ */

export type NewBusiness = Omit<Business, "id" | "created_at" | "social_handles" | "market" | "monthly_ad_spend" | "ad_platforms"> & {
  social_handles?: SocialHandles;
  market?: BusinessMarket;
  monthly_ad_spend?: string | null;
  ad_platforms?: AdPlatform[];
};
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
 * The week's account read: the strategist pass over the research dossier
 * (lib/research/strategist.ts). `read` is the StrategyRead JSON and
 * `coverage` the dossier's coverage counts when it was written, so a week
 * whose reads grew afterwards is read again rather than served stale.
 */
export interface StrategyReadRow {
  id: string;
  business_id: string;
  week_of: string; // yyyy-mm-dd (Monday)
  read: unknown;
  coverage: unknown;
  dossier_chars: number;
  model_used: string;
  prompt_version: string;
  created_at: string;
}
export type NewStrategyReadRow = Omit<StrategyReadRow, "id" | "created_at">;

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

/** Someone the owner invited to the brand: the media buyer, the strategist,
 * the creator (migration 0034). Invited by email; user_id lands at first
 * sign-in. A member sees the brand's data; the business row stays the
 * owner's to edit. */
export interface BusinessMember {
  id: string;
  business_id: string;
  email: string;
  user_id: string | null;
  role: "member";
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
}
export type NewBusinessMember = Pick<BusinessMember, "business_id" | "email"> & Partial<Pick<BusinessMember, "invited_by">>;

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
export type NewBusinessBrief = Omit<BusinessBrief, "id" | "created_at" | "target_customer"> & {
  target_customer?: TargetCustomer | null;
};
export type NewDemoRequest = Omit<DemoRequest, "id" | "created_at">;
export type NewSubscription = Omit<Subscription, "id" | "created_at" | "updated_at">;
export type NewConnection = Omit<Connection, "id" | "created_at" | "updated_at">;
export type NewCompetitor = Omit<
  Competitor,
  "id" | "created_at" | "social_handles" | "directness" | "directness_reason"
> &
  Partial<Pick<Competitor, "social_handles" | "directness" | "directness_reason">>;
export type NewCompetitorRead = Omit<CompetitorRead, "id" | "captured_at"> & { captured_at?: string };
export type NewReview = Omit<Review, "id" | "captured_at">;
export type NewSocialPost = Omit<SocialPost, "id" | "captured_at">;
export type NewSocialComment = Omit<SocialComment, "id" | "captured_at">;
export type NewAiUsage = Omit<AiUsage, "id" | "created_at">;

/** One paid call to a provider outside the model (migration 0028). */
export interface ProviderUsage {
  id: string;
  business_id: string | null;
  provider: "apify" | "dataforseo" | "youtube" | "places" | "reddit" | "other";
  operation: string;
  units: number;
  unit_label: string;
  /** Estimated from a public rate unless basis says billed. Null when no rate is known. */
  est_cost_cents: number | null;
  basis: "estimate" | "billed";
  purpose: string;
  ok: boolean;
  note: string | null;
  created_at: string;
}
export type NewProviderUsage = Omit<ProviderUsage, "id" | "created_at">;

/** An application to the founder-assisted pilot (migration 0028). */
export interface PilotApplication {
  id: string;
  full_name: string;
  email: string;
  brand_name: string;
  website: string | null;
  monthly_spend: string | null;
  objective: string | null;
  runs_meta_ads: boolean | null;
  production: string | null;
  what_next: string | null;
  status: "new" | "contacted" | "accepted" | "declined";
  created_at: string;
}
export type NewPilotApplication = Omit<PilotApplication, "id" | "created_at" | "status">;
export type NewAdHistory = Omit<AdHistory, "id" | "created_at">;
export type NewReviewDigest = Omit<ReviewDigest, "id" | "created_at">;
export type NewAlert = Omit<Alert, "id" | "created_at" | "read_at">;
