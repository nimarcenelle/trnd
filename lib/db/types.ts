/** Row shapes, one per table in supabase/setup.sql. */

/** Peers one creator can watch. */
export const MAX_PEERS = 8;

export type Goal = "followers" | "comments" | "views" | "deals" | "sales";

/** What the creator is posting for, set by them. */
export interface Goals {
  goal: Goal;
  posts_per_week: string;
  target: string;
  /** Anything else: a product to sell without feeling salesy, topics they won't touch. */
  notes: string;
}

/** The model's read of the account, from its videos and bio. Editable by the owner later. */
export interface CreatorProfile {
  niche: string[];
  audience: string[];
  /** Patterns in the creator's best videos, each tied to the numbers that show it. */
  works: string[];
  /** Patterns in the weakest ones. */
  doesnt: string[];
  style: string;
}

export interface Creator {
  id: string;
  owner_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  hearts: number | null;
  videos: number | null;
  profile: CreatorProfile | null;
  goals: Goals | null;
  hashtags: string[];
  plan: string;
  /** "trialing": a card is on file and the 14-day trial is running. */
  plan_status: "active" | "trialing" | "past_due" | "canceled";
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  scan_status: "idle" | "running" | "error";
  scan_stage: ScanStage | null;
  scan_error: string | null;
  scan_started_at: string | null;
  last_scan_at: string | null;
  /** When the creator connected their TikTok account through Login Kit; null when not connected. */
  tiktok_connected_at: string | null;
  /** Set by "Read again now": the next scan writes a new plan even inside the week. */
  plan_requested: boolean;
  /** On camera, voiceover only, or either: set in onboarding, shapes every script. */
  on_camera: OnCamera | null;
  /** When the card-on-file trial started: one per creator. */
  trial_used_at: string | null;
  /** When the model last read the account; the read is weekly. */
  profile_read_at: string | null;
  /** Whether the weekly plan email goes out; off from Settings or the email's own link. */
  email_plans: boolean;
  /** The trial end the reminder email was sent for, so a redelivered event sends nothing. */
  trial_reminder_for: string | null;
  /** Reads that failed in a row; reset by a read that finishes. The daily read backs off as it grows. */
  scan_failures: number;
  /** The creator's IANA timezone, from their browser: the weekly plan drops Tuesday 8 AM there. */
  timezone?: string | null;
  /** When the latest plan was written. */
  last_plan_at?: string | null;
  /** Their referral code, made the first time they share. */
  referral_code?: string | null;
  /** The creator whose referral link they signed up through. */
  referred_by?: string | null;
  /** When the referral's free month was granted. */
  referral_rewarded_at?: string | null;
  created_at: string;
}

export type OnCamera = "face" | "voice" | "either";

export type ScanStage = "profile" | "niche" | "peers" | "trends" | "tag" | "plan";

export interface Peer {
  id: string;
  creator_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  followers: number | null;
  reason: string | null;
  source: "match" | "owner";
  last_read_at: string | null;
  last_error: string | null;
  /** Set when the owner removes a matched peer: hidden, and never matched again. */
  removed_at: string | null;
  created_at: string;
}

export interface Video {
  id: string;
  creator_id: string;
  author: string;
  is_self: boolean;
  video_id: string;
  url: string | null;
  caption: string | null;
  hashtags: string[];
  sound: string | null;
  sound_original: boolean | null;
  duration_s: number | null;
  cover_url: string | null;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  /** Our read of the kind of video, e.g. "ranked list". */
  format: string | null;
  /** What the video is about, in our words: never a quote. Older rows hold a guess at the opening line, so it is never shown as one. */
  hook: string | null;
  /** Where TikTok keeps its captions for this video. These links expire; each read brings a fresh one. */
  subtitle_url: string | null;
  /** The words said, one caption per line, from TikTok's captions. "" when there are none to use; null when not read yet. */
  spoken: string | null;
  first_seen_at: string;
  last_read_at: string;
}

export interface VideoSnapshot {
  video_id: string;
  captured_on: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface FollowerSnapshot {
  creator_id: string;
  handle: string;
  followers: number;
  captured_on: string;
}

export type TrendKind = "hashtag" | "sound";

export interface TrendSnapshot {
  creator_id: string;
  kind: TrendKind;
  key: string;
  label: string;
  recent: number;
  prior: number;
  views: number;
  total_views: number | null;
  captured_on: string;
}

export type IdeaType = "double_down" | "borrow" | "ride";

/** One beat of the flow: the seconds it covers, what it has to do, an example of saying it, what is on screen. */
export interface Beat {
  t: string;
  /** What the beat has to get across. Plans written before this existed don't have it. */
  point?: string;
  say: string;
  shot: string;
}

/** A video to make next, with the evidence it rests on. */
export interface Idea {
  type: IdeaType;
  /** One way to open the video, not the words they have to use. */
  hook: string;
  /** One or two sentences: why this, why now, for this creator. */
  so: string;
  script: Beat[];
  length: string;
  sound: string;
  post_time: string;
  format: string;
  caption: string;
  hashtags: string[];
  why: string[];
  make_it_yours: string;
  /** The video_id it builds on: one of the creator's own, a peer's, or "" for a trend. */
  source_video: string;
  /** The hashtag or sound key it rides, for a trend idea; "" otherwise. */
  source_trend: string;
}

export interface PlanBody {
  headline: string;
  summary: string;
  ideas: Idea[];
  /** What the creator's own numbers say, in a sentence each, with the videos that show it. */
  patterns: { title: string; detail: string; videos: string[] }[];
}

export interface Plan {
  id: string;
  creator_id: string;
  body: PlanBody;
  created_at: string;
}

export interface IdeaRun {
  id: string;
  creator_id: string;
  plan_id: string | null;
  rank: number;
  idea: Idea;
  expected: { low: number; high: number } | null;
  video_id: string | null;
  status: "planned" | "posted" | "checked";
  result: { views: number | null; likes: number | null; comments: number | null; saves: number | null; read: "beat" | "in_range" | "missed" | "unknown" } | null;
  added_at: string;
  matched_at: string | null;
  checked_at: string | null;
}
