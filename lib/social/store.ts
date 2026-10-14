import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Platform, Rival, SocialProfile } from "@/lib/db/types";
import { env } from "@/lib/env";
import { readSitePage } from "@/lib/site";

import { engagementRate, growthBy, normHandle, postsPerWeek, readSocial, type Growth, type Snapshot } from "./read";

/**
 * The social half of a scan: find each company's Instagram and TikTok handles
 * from its own website (once), read every profile, and keep a daily follower
 * snapshot so growth can be measured. The brand itself (the is_self rival) is
 * read alongside its rivals.
 */

/** Handles a company's site links to, read the first time only. */
async function discoverHandles(sb: SupabaseClient, rival: Rival): Promise<void> {
  if (rival.socials_checked_at || !rival.website || (rival.instagram && rival.tiktok)) return;
  const url = /^https?:\/\//.test(rival.website) ? rival.website : `https://${rival.website}`;
  const found = await readSitePage(url).then((r) => r.socials).catch(() => ({ instagram: null, tiktok: null }));
  const patch = {
    instagram: rival.instagram ?? (found.instagram ? normHandle(found.instagram) : null),
    tiktok: rival.tiktok ?? (found.tiktok ? normHandle(found.tiktok) : null),
    socials_checked_at: new Date().toISOString(),
  };
  await sb.from("rivals").update(patch).eq("id", rival.id);
  Object.assign(rival, patch);
}

export async function refreshSocial(sb: SupabaseClient, brandId: string, rivals: Rival[]): Promise<SocialProfile[]> {
  await Promise.all(rivals.map((r) => discoverHandles(sb, r).catch((e) => console.warn(`[social] ${r.name} handles:`, (e as Error).message))));
  if (!env.apifyToken) return [];

  const owner = new Map<string, Rival>();
  for (const r of rivals) {
    if (r.instagram) owner.set(`instagram:${normHandle(r.instagram)}`, r);
    if (r.tiktok) owner.set(`tiktok:${normHandle(r.tiktok)}`, r);
  }
  if (!owner.size) return [];

  const reads = await readSocial({
    instagram: rivals.flatMap((r) => (r.instagram ? [r.instagram] : [])),
    tiktok: rivals.flatMap((r) => (r.tiktok ? [r.tiktok] : [])),
  });
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const seen = new Set<string>();

  for (const read of reads) {
    const key = `${read.platform}:${read.handle}`;
    const rival = owner.get(key);
    if (!rival) continue;
    seen.add(key);
    const { data: profile, error } = await sb
      .from("social_profiles")
      .upsert(
        {
          brand_id: brandId,
          rival_id: rival.id,
          platform: read.platform,
          handle: read.handle,
          display_name: read.displayName,
          followers: read.followers,
          following: read.following,
          posts: read.posts,
          recent: read.recent,
          posts_per_week: postsPerWeek(read.recent),
          engagement_rate: engagementRate(read.recent, read.followers),
          fetched_at: now,
          error: null,
        },
        { onConflict: "rival_id,platform" },
      )
      .select("id")
      .single();
    if (error || !profile) {
      console.warn(`[social] save ${key}:`, error?.message);
      continue;
    }
    if (read.followers !== null) {
      await sb.from("social_snapshots").upsert({ profile_id: profile.id, followers: read.followers, captured_on: today }, { onConflict: "profile_id,captured_on" });
    }
  }

  // A handle the actor returned nothing for is worth saying so on the page.
  for (const [key, rival] of owner) {
    if (seen.has(key)) continue;
    const [platform, handle] = key.split(":") as [Platform, string];
    await sb
      .from("social_profiles")
      .upsert({ brand_id: brandId, rival_id: rival.id, platform, handle, error: `No public ${platform === "instagram" ? "Instagram" : "TikTok"} profile found for @${handle}.` }, { onConflict: "rival_id,platform" });
  }

  const { data } = await sb.from("social_profiles").select("*").eq("brand_id", brandId);
  return (data ?? []) as SocialProfile[];
}

/** Followers gained over the last `days`, per profile, from the snapshots. */
export async function followerGrowth(sb: SupabaseClient, profileIds: string[], days = 30): Promise<Map<string, Growth>> {
  if (!profileIds.length) return new Map();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("social_snapshots").select("profile_id, followers, captured_on").in("profile_id", profileIds).gte("captured_on", since).order("captured_on");
  return growthBy((data ?? []) as Snapshot[]);
}
