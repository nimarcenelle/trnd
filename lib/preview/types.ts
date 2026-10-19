import type { CreatorProfile, PlanBody } from "@/lib/db/types";
import type { TrendRow } from "@/lib/creators/stats";
import type { ReadAuthor, ReadVideo } from "@/lib/tiktok/read";

/**
 * reading: the profile read is running · confirm: read, waiting for "that's me"
 * niche: reading the niche · idea: writing the plan · ready · ineligible · error
 */
export type PreviewStatus = "reading" | "confirm" | "niche" | "idea" | "ready" | "ineligible" | "error";

export interface PreviewPeer {
  handle: string;
  name: string | null;
  followers: number | null;
  /** Their best video in the niche sample. */
  best: { videoId: string; hook: string; views: number | null; url: string | null } | null;
}

export interface Preview {
  id: string;
  handle: string;
  status: PreviewStatus;
  step_started_at: string | null;
  author: ReadAuthor | null;
  videos: ReadVideo[];
  profile: CreatorProfile | null;
  hashtags: string[];
  peers: PreviewPeer[];
  sample: ReadVideo[];
  trends: TrendRow[];
  plan: PlanBody | null;
  goal: string | null;
  /** Why it can't go on: a private or missing account, too few videos, or what failed. */
  reason: string | null;
  claimed_by: string | null;
  created_at: string;
}

/** How long a preview is reused for the same handle. */
export const PREVIEW_TTL_MS = 72 * 3_600_000;
/** Fewer public videos than this and there is nothing to learn from yet. */
export const MIN_VIDEOS = 3;

/** The cookie that ties a visitor's preview to the account they create. */
export const PREVIEW_COOKIE = "trnd_preview";
