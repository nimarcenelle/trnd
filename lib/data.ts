import "server-only";

import { cache } from "react";

import { createServerSupabase } from "@/lib/db/supabase";
import type { Ad, AdChange, Brand, OwnAdResult, Report, Rival, RivalEmail, SiteChange, SocialProfile } from "@/lib/db/types";
import type { SiteSnapshot } from "@/lib/sitewatch/snapshot";

/** Reads for the pages, as the signed-in user (RLS keeps them to their own brand). */

export const getBrand = cache(async (userId: string): Promise<Brand | null> => {
  const sb = await createServerSupabase();
  const { data } = await sb.from("brands").select("*").eq("owner_id", userId).maybeSingle<Brand>();
  return data;
});

/** The brand's competitors (not the brand itself). */
export async function listRivals(brandId: string): Promise<Rival[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("rivals").select("*").eq("brand_id", brandId).eq("is_self", false).order("created_at");
  return (data ?? []) as Rival[];
}

/** The brand's own row, watched like a rival. Null for brands not yet scanned since self-tracking. */
export async function getSelf(brandId: string): Promise<Rival | null> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("rivals").select("*").eq("brand_id", brandId).eq("is_self", true).maybeSingle<Rival>();
  return data;
}

export async function listSocial(brandId: string): Promise<SocialProfile[]> {
  const sb = await createServerSupabase();
  // Facebook posts are read only to match ads to their engagement, not shown as a profile.
  const { data } = await sb.from("social_profiles").select("*").eq("brand_id", brandId).neq("platform", "facebook");
  return (data ?? []) as SocialProfile[];
}

export async function listSnapshots(profileIds: string[], days = 60): Promise<{ profile_id: string; followers: number; captured_on: string }[]> {
  if (!profileIds.length) return [];
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("social_snapshots").select("profile_id, followers, captured_on").in("profile_id", profileIds).gte("captured_on", since).order("captured_on");
  return (data ?? []) as { profile_id: string; followers: number; captured_on: string }[];
}

export async function listAds(brandId: string, opts: { rivalId?: string; activeOnly?: boolean } = {}): Promise<Ad[]> {
  const sb = await createServerSupabase();
  let q = sb.from("ads").select("*").eq("brand_id", brandId);
  if (opts.rivalId) q = q.eq("rival_id", opts.rivalId);
  if (opts.activeOnly) q = q.eq("active", true);
  const { data } = await q.order("started_at", { ascending: true, nullsFirst: false }).limit(1000);
  return (data ?? []) as Ad[];
}

export async function listReports(brandId: string, limit = 10): Promise<Report[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("reports").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Report[];
}

export async function listChanges(brandId: string, sinceDays = 14): Promise<(AdChange & { ad: Ad | null })[]> {
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data } = await sb
    .from("ad_changes")
    .select("*, ad:ads(*)")
    .eq("brand_id", brandId)
    .gte("detected_at", since)
    .order("detected_at", { ascending: false })
    .limit(200);
  return (data ?? []) as (AdChange & { ad: Ad | null })[];
}

export async function listResults(brandId: string): Promise<OwnAdResult[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("own_ad_results").select("*").eq("brand_id", brandId).order("spend", { ascending: false, nullsFirst: false }).limit(2000);
  return (data ?? []) as OwnAdResult[];
}

/** Material changes on competitors' websites. Empty before 0103_signals.sql has run. */
export async function listSiteChanges(brandId: string, opts: { rivalId?: string; days?: number } = {}): Promise<SiteChange[]> {
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000).toISOString();
  let q = sb.from("site_changes").select("*").eq("brand_id", brandId).gte("detected_at", since);
  if (opts.rivalId) q = q.eq("rival_id", opts.rivalId);
  const { data } = await q.order("detected_at", { ascending: false }).limit(300);
  return (data ?? []) as SiteChange[];
}

/** Competitors' marketing emails, newest first, without the signup confirmations. */
export async function listEmails(brandId: string, opts: { rivalId?: string; days?: number } = {}): Promise<RivalEmail[]> {
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - (opts.days ?? 60) * 86_400_000).toISOString();
  let q = sb.from("emails").select("*").eq("brand_id", brandId).gte("received_at", since).or("kind.is.null,kind.neq.confirmation");
  if (opts.rivalId) q = q.eq("rival_id", opts.rivalId);
  const { data } = await q.order("received_at", { ascending: false }).limit(300);
  return (data ?? []) as RivalEmail[];
}

/** The latest snapshot of a rival's website, or null. */
export async function getSiteSnapshot(rivalId: string): Promise<{ url: string; data: SiteSnapshot; captured_at: string } | null> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("site_snapshots").select("url, data, captured_at").eq("rival_id", rivalId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { url: string; data: SiteSnapshot; captured_at: string } | null) ?? null;
}
