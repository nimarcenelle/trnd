/** Row shapes, one per table in supabase/migrations (0100 and 0101). */

/** Rivals one brand can watch. */
export const MAX_RIVALS = 10;

export interface Brand {
  id: string;
  owner_id: string;
  url: string;
  name: string;
  summary: string | null;
  category: string | null;
  profile: BrandProfile | null;
  objectives: Objectives | null;
  plan: string;
  plan_status: "active" | "past_due" | "canceled";
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  scan_status: "idle" | "running" | "error";
  scan_error: string | null;
  /** The owner gets the update emails (unsubscribe turns this off). */
  email_updates?: boolean;
  scan_started_at: string | null;
  /** The competitor candidates setup did not seat, and the swaps the first scan made (lib/rivals.ts); null before 0106. */
  candidates?: { spares: SpareCandidate[]; swapped: { out: string; in: string; at: string }[] } | null;
  /** Where a running scan is (lib/scan.ts); null when idle or before 0105. */
  scan_state?: { stage: "ads" | "tag" | "report"; started: string; force: boolean; remapped: boolean } | null;
  last_scan_at: string | null;
  created_at: string;
}

/** A competitor the model named that did not get one of the seats. */
export interface SpareCandidate {
  name: string;
  website: string;
  reason: string;
  directness: number;
}

export interface Rival {
  id: string;
  brand_id: string;
  name: string;
  website: string | null;
  reason: string | null;
  page_id: string | null;
  page_name: string | null;
  /** How the Page was settled: confirmed against its ads, or pasted by the owner. Null: not yet confirmed. */
  page_source?: "checked" | "owner" | null;
  /** When "no active Meta ads" was last confirmed by the full search (lib/scan.ts confirmNoAds); null before 0107. */
  ads_confirmed_at?: string | null;
  source: "ai" | "owner";
  /** The brand itself, watched like a rival so its own ads are read too. */
  is_self: boolean;
  instagram: string | null;
  tiktok: string | null;
  socials_checked_at: string | null;
  last_scraped_at: string | null;
  last_error: string | null;
  /** Its inbound email address is <slug>-<inbox_token>@INBOUND_DOMAIN. */
  inbox_token?: string | null;
  email_status?: EmailStatus | null;
  email_note?: string | null;
  site_checked_at?: string | null;
  /** What the last pull from each source found. */
  health?: RivalHealth | null;
  created_at: string;
}

export interface SourceHealth {
  at: string;
  ok: boolean;
  /** Ads read, or products in the catalog. */
  count?: number | null;
  /** "library" or "apify" for ads. */
  via?: string | null;
  note?: string | null;
}

export interface RivalHealth {
  ads?: SourceHealth;
  site?: SourceHealth;
}

export type EmailStatus = "subscribed" | "manual" | "receiving";

export type AdFormat = "video" | "image" | "carousel" | "dco" | "unknown";

export interface Ad {
  id: string;
  brand_id: string;
  rival_id: string;
  archive_id: string;
  page_name: string | null;
  body: string | null;
  title: string | null;
  cta: string | null;
  link_url: string | null;
  format: AdFormat;
  image_url: string | null;
  video_url: string | null;
  platforms: string[];
  variants: number;
  started_at: string | null;
  active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  stopped_at: string | null;
  angle: string | null;
  hook: string | null;
  offer: string | null;
  /** Position among the Page's ads sorted by impressions on the last read (0 = most), and how many were read. */
  impression_rank?: number | null;
  rank_total?: number | null;
  topic?: string | null;
  engagement?: AdEngagement | null;
  /** Our copy of the image in Supabase Storage (Facebook's links expire). */
  stored_image_url?: string | null;
  /** The conversion score, 0-100 (lib/score.ts). */
  score?: number | null;
  score_parts?: ScoreParts | null;
}

/** The organic post an ad also runs as, and how it did. */
export interface AdEngagement {
  platform: "facebook" | "instagram" | "tiktok";
  url: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  /** -1 (negative) to 1 (positive), from the post's comments; null when none were read. */
  sentiment: number | null;
  /** The company's median interactions per post on that platform, what this post is judged against. */
  baseline: number | null;
}

/** Each signal 0-1 (null when unavailable), the blend's confidence, and the weights used. */
export interface ScoreParts {
  longevity: number | null;
  reach: number | null;
  repetition: number | null;
  engagement: number | null;
  sentiment: number | null;
  confidence: "high" | "medium" | "low";
}

export type ChangeKind = "launched" | "stopped" | "proven";

export interface AdChange {
  id: string;
  brand_id: string;
  rival_id: string;
  ad_id: string | null;
  kind: ChangeKind;
  detected_at: string;
}

export interface Report {
  id: string;
  brand_id: string;
  kind: "baseline" | "update";
  body: ReportBody;
  created_at: string;
}

/** What the model writes after a scan (lib/ai/analyze.ts holds the schema). */
export interface ReportBody {
  headline: string;
  summary: string;
  /**
   * Patterns across ads, sites and emails. Evidence holds ad archive ids,
   * "site:<site_changes.id>" and "email:<emails.id>".
   */
  /** `line`: the one-sentence version shown in the feed; absent on older reports. */
  insights: { title: string; line?: string; detail: string; evidence: string[]; status?: "new" | "ongoing" | "repeated" }[];
  /** What to do about each competitor move, ranked. Absent on reports written before the opportunity engine. */
  opportunities?: Opportunity[];
  /** Older reports: ads to make next. */
  plays?: Play[];
  /** Each notable competitor move, judged for this brand: copy it, adapt it, or skip it. */
  translations?: Translation[];
  rivals: { name: string; strategy: string; watch_for: string }[];
  /** Where the brand sits against each rival; absent on reports written before it existed. */
  landscape?: Landscape;
  changes?: { launched: number; stopped: number; proven: number; site?: number; emails?: number };
}

export type OpportunityType = "get_ahead" | "win_choice" | "counter" | "ignore";
export type Level = "high" | "medium" | "low";

/** A competitor move (or several, connected), read through the brand's business, with what to do about it. */
export interface Opportunity {
  type: OpportunityType;
  title: string;
  /** One sentence for the feed: what to do and the number behind it. Absent on older reports. */
  punch?: string;
  competitors: string[];
  /** What was observed, across channels. */
  signal: string;
  /** What the competitor seems to be trying to do. Inferred, never certain. */
  intent: string;
  /** Why it does or doesn't matter for this brand: its customers, strengths, economics, goal. */
  fit: string;
  urgency: Level;
  confidence: Level;
  recommendation: string;
  /** The campaign to run; empty strings for "ignore". */
  brief: { angle: string; hook: string; offer: string; creative: string; format: string; audience: string; experiment: string };
  evidence: string[];
  /** Against the standing report: carried over as it was, refreshed, or new this scan. Absent on older reports. */
  status?: "standing" | "updated" | "new";
}

/** An ad to make next. Older reports carry only `brief`; newer ones the structured fields. */
export interface Play {
  title: string;
  why: string;
  brief?: string;
  hook?: string;
  format?: string;
  creative?: string;
  offer?: string;
  audience?: string;
  inspired_by: string[];
}

export interface Translation {
  competitor: string;
  move: string;
  verdict: "copy" | "adapt" | "skip";
  why: string;
  adapt: string;
  evidence: string[];
}

export interface Landscape {
  summary: string;
  /** One row per company, the brand first: how each is positioned. */
  positions: { name: string; price_tier: "budget" | "mid" | "premium" | "unknown"; audience: string; message: string; strength: string }[];
  /** What the brand does that rivals don't, and the reverse. */
  you_vs_them: { only_you: string[]; only_them: string[]; open_lanes: string[] };
}

/** What the brand is trying to do right now, set by the owner. */
export interface Objectives {
  goal: "new_customers" | "subscriptions" | "launch" | "retention" | "awareness";
  monthly_budget: string;
  target_cost: string;
  focus: string;
  /** Constraints and anything else to know: discount limits, timing, what they won't do. */
  notes: string;
}

/** One row of the owner's Ads Manager export. */
export interface OwnAdResult {
  id: string;
  brand_id: string;
  ad_name: string;
  body: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  roas: number | null;
  period_start: string | null;
  period_end: string | null;
  uploaded_at: string;
}

/** What the brand sells, to whom and how: read off the site, corrected by the owner. */
export interface BrandProfile {
  what_it_sells: string;
  price_point: string;
  price_tier: "budget" | "mid" | "premium" | "unknown";
  audience: string;
  value_props: string[];
  proof_points: string[];
  offers: string[];
  tone: string;
  differentiators: string[];
}

export type Platform = "instagram" | "tiktok" | "facebook";

export interface SocialPost {
  url: string | null;
  caption: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  kind: string | null;
  shares?: number | null;
  /** A few comment texts, when the source gives them (for sentiment). */
  top_comments?: string[];
}

export interface SocialProfile {
  id: string;
  brand_id: string;
  rival_id: string;
  platform: Platform;
  handle: string;
  display_name: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  recent: SocialPost[];
  posts_per_week: number | null;
  engagement_rate: number | null;
  fetched_at: string | null;
  error: string | null;
}

export interface SocialSnapshot {
  id: string;
  profile_id: string;
  followers: number;
  captured_on: string;
}

export type SiteChangeKind =
  | "new_product"
  | "dropped_product"
  | "price_up"
  | "price_down"
  | "sale_started"
  | "sale_ended"
  | "promo_added"
  | "promo_removed"
  | "message_changed";

export interface SiteChange {
  id: string;
  brand_id: string;
  rival_id: string;
  kind: SiteChangeKind;
  title: string;
  before: string | null;
  after: string | null;
  url: string | null;
  detected_at: string;
}

export type EmailKind = "promo" | "launch" | "newsletter" | "content" | "retention" | "announcement" | "confirmation" | "other";

export interface RivalEmail {
  id: string;
  brand_id: string;
  rival_id: string;
  message_id: string | null;
  from_address: string | null;
  from_name: string | null;
  subject: string;
  preview: string | null;
  body: string | null;
  links: { text: string; url: string }[];
  received_at: string;
  kind: EmailKind | null;
  offer: string | null;
  theme: string | null;
  is_repeat: boolean | null;
}
