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
  scan_started_at: string | null;
  last_scan_at: string | null;
  created_at: string;
}

export interface Rival {
  id: string;
  brand_id: string;
  name: string;
  website: string | null;
  reason: string | null;
  page_id: string | null;
  page_name: string | null;
  source: "ai" | "owner";
  /** The brand itself, watched like a rival so its own ads are read too. */
  is_self: boolean;
  instagram: string | null;
  tiktok: string | null;
  socials_checked_at: string | null;
  last_scraped_at: string | null;
  last_error: string | null;
  created_at: string;
}

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
  insights: { title: string; detail: string; evidence: string[] }[];
  plays: Play[];
  /** Each notable competitor move, judged for this brand: copy it, adapt it, or skip it. */
  translations?: Translation[];
  rivals: { name: string; strategy: string; watch_for: string }[];
  /** Where the brand sits against each rival; absent on reports written before it existed. */
  landscape?: Landscape;
  changes?: { launched: number; stopped: number; proven: number };
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

export type Platform = "instagram" | "tiktok";

export interface SocialPost {
  url: string | null;
  caption: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  kind: string | null;
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
