import "server-only";

import { isModelConfigured } from "@/lib/env";
import { readSocialWithStatus } from "@/lib/social/read";

import { benchmarkFrom, nicheTag, type Benchmark } from "./benchmark";
import { inferNicheTag, readNiche } from "./niche";
import { readCreator, type CreatorRead } from "./read";
import { creatorStats, headline, type CreatorStats } from "./stats";

export type CreatorPlatform = "instagram" | "tiktok";

export interface CreatorCheck {
  error?: string;
  handle?: string;
  platform?: CreatorPlatform;
  niche?: string;
  /** Where the visitor came from, carried to the upgrade and the email form. */
  src?: string;
  /** The saved result's id: its share link is /c/<id>. */
  id?: string | null;
  displayName?: string | null;
  followers?: number | null;
  stats?: CreatorStats;
  headline?: string;
  read?: CreatorRead | null;
  /** The top posts in their niche right now, and the gap to them. Null when no niche or no read of it. */
  benchmark?: Benchmark | null;
}

export const isHandle = (h: string) => /^[a-z0-9._]{2,30}$/.test(h);
export const platformName = (p: CreatorPlatform) => (p === "tiktok" ? "TikTok" : "Instagram");
/** A ?src= code: short, lowercase, safe in a URL and a log. */
export const cleanSrc = (v: unknown) => (typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) : "");

/**
 * Read one public profile and measure it: the numbers, then the written read
 * when the model is configured. Used by the free check, the weekly re-check
 * and the studio's teardowns. Errors come back as `error`, never thrown.
 */
export async function runCheck(handle: string, platform: CreatorPlatform, niche = ""): Promise<CreatorCheck> {
  const { reads, complete } = await readSocialWithStatus({ instagram: platform === "instagram" ? [handle] : [], tiktok: platform === "tiktok" ? [handle] : [] });
  const profile = reads.find((r) => r.platform === platform && r.handle === handle) ?? reads.find((r) => r.platform === platform);
  if (!profile) {
    return {
      error: complete[platform]
        ? `We couldn't find a public ${platformName(platform)} account called @${handle}. Check the spelling, and that the account is public.`
        : `The read of @${handle} didn't finish. Try again in a minute.`,
    };
  }
  const stats = creatorStats(profile.recent);
  if (!stats) return { error: `@${handle} needs at least 4 recent public posts with like counts for the check to say anything.` };

  // The bar: the top posts under their niche hashtag right now. A failed read leaves the check without it, nothing more.
  let benchmark: Benchmark | null = null;
  try {
    const captions = profile.recent.map((p) => p.caption);
    const tag = nicheTag(niche, captions) ?? (await inferNicheTag(captions));
    if (tag) benchmark = benchmarkFrom(await readNiche(tag, platform), { handle, followers: profile.followers, stats, tag, platform });
  } catch (e) {
    console.warn("[creator] niche read failed:", (e as Error).message);
  }

  let read: CreatorRead | null = null;
  if (isModelConfigured) {
    try {
      read = await readCreator({ handle, platform, niche, stats, benchmark });
    } catch (e) {
      console.warn("[creator] read failed:", (e as Error).message);
    }
  }
  return { handle, platform, niche, displayName: profile.displayName, followers: profile.followers, stats, headline: headline(stats), read, benchmark };
}
