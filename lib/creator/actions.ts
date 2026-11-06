"use server";

import { headers } from "next/headers";

import { env, isModelConfigured } from "@/lib/env";
import { normHandle, readSocialWithStatus } from "@/lib/social/read";

import { readCreator, type CreatorRead } from "./read";
import { creatorStats, headline, type CreatorStats } from "./stats";

export interface CreatorCheck {
  error?: string;
  handle?: string;
  platform?: "instagram" | "tiktok";
  niche?: string;
  displayName?: string | null;
  followers?: number | null;
  stats?: CreatorStats;
  headline?: string;
  read?: CreatorRead | null;
}

/**
 * The free check is public and every run spends Apify and OpenAI credit, so
 * each address gets a few an hour and a handle read in the last hour is
 * served again. Both live in the instance's memory: a best-effort brake, not
 * a guarantee across instances.
 */
const PER_HOUR = 4;
const HOUR = 3_600_000;
const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; result: CreatorCheck }>();

function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_HOUR) return false;
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function checkCreatorAction(_prev: CreatorCheck, formData: FormData): Promise<CreatorCheck> {
  const handle = normHandle(String(formData.get("handle") ?? ""));
  const platform = formData.get("platform") === "instagram" ? "instagram" : "tiktok";
  const niche = String(formData.get("niche") ?? "").trim().slice(0, 80);
  if (!/^[a-z0-9._]{2,30}$/.test(handle)) return { error: "Enter your handle, like @yourname." };
  if (!env.apifyToken) return { error: "The profile check is switched off on this server right now. Try again later." };

  const key = `${platform}:${handle}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < HOUR && (!niche || cached.result.niche === niche)) return cached.result;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return { error: "That's a few checks in an hour from here. Try again in a little while." };

  const { reads, complete } = await readSocialWithStatus({ instagram: platform === "instagram" ? [handle] : [], tiktok: platform === "tiktok" ? [handle] : [] });
  const profile = reads.find((r) => r.platform === platform && r.handle === handle) ?? reads.find((r) => r.platform === platform);
  if (!profile) {
    return {
      error: complete[platform]
        ? `We couldn't find a public ${platform === "tiktok" ? "TikTok" : "Instagram"} account called @${handle}. Check the spelling, and that the account is public.`
        : `The read of @${handle} didn't finish. Try again in a minute.`,
    };
  }
  const stats = creatorStats(profile.recent);
  if (!stats) return { error: `@${handle} needs at least 4 recent public posts with like counts for the check to say anything.` };

  let read: CreatorRead | null = null;
  if (isModelConfigured) {
    try {
      read = await readCreator({ handle, platform, niche, stats });
    } catch (e) {
      console.warn("[creator] read failed:", (e as Error).message);
    }
  }
  const result: CreatorCheck = { handle, platform, niche, displayName: profile.displayName, followers: profile.followers, stats, headline: headline(stats), read };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 2000) cache.clear();
  return result;
}
