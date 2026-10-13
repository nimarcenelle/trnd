/** Row shapes, one per table in supabase/migrations/0100_surveillance.sql. */

/** Rivals one brand can watch. */
export const MAX_RIVALS = 10;

export interface Brand {
  id: string;
  owner_id: string;
  url: string;
  name: string;
  summary: string | null;
  category: string | null;
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

/** What the model writes after a scan (lib/ai/report.ts holds the schema). */
export interface ReportBody {
  headline: string;
  summary: string;
  insights: { title: string; detail: string; evidence: string[] }[];
  plays: { title: string; why: string; brief: string; inspired_by: string[] }[];
  rivals: { name: string; strategy: string; watch_for: string }[];
  changes?: { launched: number; stopped: number; proven: number };
}
