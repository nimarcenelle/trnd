import type { CreatorCheck } from "./check";
import type { ScoredPost } from "./stats";

/** What the result card draws. Plain data, so a server page can build it and hand it to the client card. */
export interface CardData {
  handle: string;
  platform: "instagram" | "tiktok";
  displayName?: string | null;
  followers?: number | null;
  posts: ScoredPost[];
  breakouts: number;
  bestMultiple: number;
  medianInteractions: number;
  verdict?: string | null;
}

export const toCard = (r: CreatorCheck): CardData => ({
  handle: r.handle ?? "",
  platform: r.platform ?? "tiktok",
  displayName: r.displayName,
  followers: r.followers,
  posts: r.stats!.posts,
  breakouts: r.stats!.breakouts,
  bestMultiple: r.stats!.bestMultiple,
  medianInteractions: r.stats!.medianInteractions,
  verdict: r.read?.verdict,
});
