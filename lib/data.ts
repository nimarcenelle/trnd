import "server-only";

import { cache } from "react";

import { allRows } from "@/lib/db/rows";
import { createServerSupabase } from "@/lib/db/supabase";
import type { Creator, FollowerSnapshot, IdeaRun, Peer, Plan, TrendSnapshot, Video } from "@/lib/db/types";

/** Reads for the pages, as the signed-in user (RLS keeps them to their own creator). */

export const getCreator = cache(async (userId: string): Promise<Creator | null> => {
  const sb = await createServerSupabase();
  const { data } = await sb.from("creators").select("*").eq("owner_id", userId).maybeSingle<Creator>();
  return data;
});

export async function listPeers(creatorId: string): Promise<Peer[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("peers").select("*").eq("creator_id", creatorId).is("removed_at", null).order("followers", { ascending: false, nullsFirst: false });
  return (data ?? []) as Peer[];
}

/**
 * Videos posted in the last `days`, newest first, every page of them: the
 * creator's own (`self: true`), some authors' (`authors`), or everything read
 * including the niche hashtag sample.
 */
/** The creator's own videos: the last 120 days, or the latest 12 for someone who posts rarely (same rule as the scan). */
export async function listOwnVideos(creatorId: string): Promise<Video[]> {
  const recent = await listVideos(creatorId, { days: 120, self: true });
  return recent.length >= 5 ? recent : (await listVideos(creatorId, { days: 3650, self: true })).slice(0, 12);
}

export async function listVideos(creatorId: string, opts: { days?: number; self?: boolean; authors?: string[] } = {}): Promise<Video[]> {
  if (opts.authors && !opts.authors.length) return [];
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - (opts.days ?? 120) * 86_400_000).toISOString();
  return allRows<Video>((from, to) => {
    let q = sb.from("videos").select("*").eq("creator_id", creatorId).gte("posted_at", since);
    if (opts.self !== undefined) q = q.eq("is_self", opts.self);
    if (opts.authors) q = q.in("author", opts.authors);
    return q.order("posted_at", { ascending: false }).order("id").range(from, to);
  });
}

export async function listPlans(creatorId: string, limit = 6): Promise<Plan[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("plans").select("*").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Plan[];
}

export async function listRuns(creatorId: string): Promise<IdeaRun[]> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("idea_runs").select("*").eq("creator_id", creatorId).order("added_at", { ascending: false }).limit(50);
  return (data ?? []) as IdeaRun[];
}

/** Follower counts per day for the creator and their peers. */
export async function listFollowers(creatorId: string, days = 60): Promise<FollowerSnapshot[]> {
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("follower_snapshots").select("*").eq("creator_id", creatorId).gte("captured_on", since).order("captured_on");
  return (data ?? []) as FollowerSnapshot[];
}

/** Every trend snapshot of the last `days`, oldest first, for each key's history. */
export async function listTrendSnapshots(creatorId: string, days = 21): Promise<TrendSnapshot[]> {
  const sb = await createServerSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("trend_snapshots").select("*").eq("creator_id", creatorId).gte("captured_on", since).order("captured_on").limit(3000);
  return (data ?? []) as TrendSnapshot[];
}
