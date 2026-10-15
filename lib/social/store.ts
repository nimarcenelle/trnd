import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Platform, Rival, SocialProfile } from "@/lib/db/types";
import { env } from "@/lib/env";
import { readSitePage } from "@/lib/site";

import { engagementRate, growthBy, normHandle, postsPerWeek, readFacebook, readSocialWithStatus, type Growth, type Snapshot } from "./read";

/** Facebook posts are read for ad engagement, every few days rather than daily. */
const FACEBOOK_EVERY_MS = 3 * 86_400_000;

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
  const found = await readSitePage(url).then((r) => r.socials).catch(() => ({ instagram: null, tiktok: null, facebook: null }));
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

  // Facebook Pages whose posts are due for a re-read.
  const { data: fbRows } = await sb.from("social_profiles").select("rival_id, fetched_at").eq("brand_id", brandId).eq("platform", "facebook");
  const fbFetched = new Map((fbRows ?? []).map((r) => [r.rival_id as string, r.fetched_at as string | null]));
  const fbDue = rivals.filter((r) => r.page_id && !(Date.now() - Date.parse(fbFetched.get(r.id) ?? "1970-01-01") < FACEBOOK_EVERY_MS));
  for (const r of fbDue) owner.set(`facebook:${r.page_id}`, r);
  if (!owner.size) return [];

  const [social, facebook] = await Promise.all([
    readSocialWithStatus({
      instagram: rivals.flatMap((r) => (r.instagram ? [r.instagram] : [])),
      tiktok: rivals.flatMap((r) => (r.tiktok ? [r.tiktok] : [])),
    }),
    readFacebook(fbDue.map((r) => r.page_id!)),
  ]);
  const reads = [...social.reads, ...facebook];
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

  // A handle the actor returned nothing for is worth saying so on the page,
  // but only when its runs all finished: a run that died says nothing about
  // the handles it carried, and what was read last time stays.
  for (const [key, rival] of owner) {
    if (seen.has(key) || key.startsWith("facebook:")) continue;
    const [platform, handle] = key.split(":") as [Platform, string];
    if (!social.complete[platform as "instagram" | "tiktok"]) {
      const { data: had } = await sb.from("social_profiles").select("id").eq("rival_id", rival.id).eq("platform", platform).maybeSingle();
      if (had) continue;
      await sb
        .from("social_profiles")
        .upsert({ brand_id: brandId, rival_id: rival.id, platform, handle, error: `${platform === "instagram" ? "Instagram" : "TikTok"} could not be read this scan; it is tried again next time.` }, { onConflict: "rival_id,platform" });
      continue;
    }
    // A profile read before is a real profile: a scan that misses it keeps its numbers and says the read failed.
    const { data: prior } = await sb.from("social_profiles").select("followers").eq("rival_id", rival.id).eq("platform", platform).maybeSingle<{ followers: number | null }>();
    const label = platform === "instagram" ? "Instagram" : "TikTok";
    await sb
      .from("social_profiles")
      .upsert(
        { brand_id: brandId, rival_id: rival.id, platform, handle, error: prior?.followers !== null && prior?.followers !== undefined ? `${label} could not be read this scan; the last read stands.` : `No public ${label} profile found for @${handle}.` },
        { onConflict: "rival_id,platform" },
      );
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
