import "server-only";

import { cache } from "react";

import { createServerSupabase } from "@/lib/db/supabase";
import type { Ad, AdChange, Brand, Report, Rival } from "@/lib/db/types";

/** Reads for the pages, as the signed-in user (RLS keeps them to their own brand). */

export const getBrand = cache(async (userId: string): Promise<Brand | null> => {
  const sb = await createServerSupabase();
  const { data } = await sb.from("brands").select("*").eq("owner_id", userId).maybeSingle<Brand>();
  return data;
});

export async function listRivals(brandId: string): Promise<Rival[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("rivals").select("*").eq("brand_id", brandId).order("created_at");
  return (data ?? []) as Rival[];
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
