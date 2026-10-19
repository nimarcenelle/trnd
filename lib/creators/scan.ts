import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAccount, tagVideos, videoLine, writePlan } from "@/lib/ai/creators";
import { planState } from "@/lib/billing";
import { adminSupabase } from "@/lib/db/supabase";
import type { Creator, IdeaRun, Peer, PlanBody, ScanStage, Video } from "@/lib/db/types";
import { MAX_PEERS } from "@/lib/db/types";
import { sendPlanEmail } from "@/lib/email";
import { env, isModelConfigured } from "@/lib/env";
import { todayIso } from "@/lib/format";
import { readConnected } from "@/lib/tiktok/connect";
import { isTiktokConfigured, readCreativeCenter, readHashtags, readProfiles, type ReadAuthor, type ReadVideo } from "@/lib/tiktok/read";

import { borrowScore, matchIdea, normalOf, outcomeOf, postsPerWeek, rankPeers, SETTLE_HOURS, timesNormal, trendRows, type PeerCandidate } from "./stats";

/**
 * One scan, in four stages, each saved before the next starts so a scan cut
 * short picks up where it stopped:
 *   profile: the creator's own videos and numbers, and (first time, then weekly) the model's read of the account
 *   peers:   videos under the niche hashtags; creators like them picked from those; each peer's recent videos
 *   trends:  hashtags and sounds across everything read in the last 14 days, staged and snapshotted
 *   plan:    ideas posted since the last scan matched and checked; once a week (or when asked), new videos tagged and the plan written
 * A stage that starts past the time budget hands the rest to a fresh function.
 */

const STAGES: ScanStage[] = ["profile", "peers", "trends", "plan"];
/** Leave room under the 300s function limit for the slowest stage (an Apify read or the plan). */
const DEFAULT_BUDGET_MS = 150_000;
/** The model re-reads the account once a week; numbers are read every scan. */
const PROFILE_EVERY_MS = 7 * 86_400_000;
/** Matched peers are looked for again when fewer than this remain. */
const MIN_PEERS = 4;
const NICHE_TAGS_READ = 4;
/** Reads are daily; a new plan (and its email) is weekly, unless the creator asks for one. */
const PLAN_EVERY_MS = 6.5 * 86_400_000;

export interface ScanResult {
  creator: string;
  stages: ScanStage[];
  handedOff: boolean;
  error?: string;
}

const today = () => todayIso();

/** Videos and their day's snapshot, written together; the model's tags on a row are never overwritten here. */
async function saveVideos(sb: SupabaseClient, creatorId: string, videos: ReadVideo[], self: string): Promise<void> {
  if (!videos.length) return;
  const now = new Date().toISOString();
  const rows = videos.map((v) => ({
    creator_id: creatorId,
    author: v.author,
    is_self: v.author === self,
    video_id: v.videoId,
    url: v.url,
    caption: v.caption,
    hashtags: v.hashtags,
    sound: v.sound,
    sound_original: v.soundOriginal,
    duration_s: v.durationS,
    cover_url: v.coverUrl,
    posted_at: v.postedAt,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    saves: v.saves,
    last_read_at: now,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await sb.from("videos").upsert(rows.slice(i, i + 200), { onConflict: "creator_id,video_id" }).select("id, video_id, views, likes, comments, shares, saves");
    if (error) throw new Error(`Saving videos failed: ${error.message}`);
    const snaps = (data ?? []).map((r) => ({ video_id: r.id, captured_on: today(), views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves }));
    if (snaps.length) await sb.from("video_snapshots").upsert(snaps, { onConflict: "video_id,captured_on" });
  }
}

async function snapFollowers(sb: SupabaseClient, creatorId: string, authors: ReadAuthor[]): Promise<void> {
  const rows = authors.filter((a) => a.followers !== null).map((a) => ({ creator_id: creatorId, handle: a.handle, followers: a.followers, captured_on: today() }));
  if (rows.length) await sb.from("follower_snapshots").upsert(rows, { onConflict: "creator_id,handle,captured_on" });
}

async function listVideos(sb: SupabaseClient, creatorId: string, days: number): Promise<Video[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb.from("videos").select("*").eq("creator_id", creatorId).gte("posted_at", since).order("posted_at", { ascending: false }).limit(2000);
  return (data ?? []) as Video[];
}

/* -------------------------------- stages ---------------------------------- */

async function profileStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const read = await readProfiles([c.handle], 30);
  const me = read.authors.get(c.handle);
  if (!me) throw new Error(`We couldn't read @${c.handle} on TikTok. Check the handle, and that the account is public.`);
  // A connected account's own numbers, straight from TikTok, over the public read where both exist.
  const connected = c.tiktok_connected_at ? await readConnected(c.id).catch((e) => (console.warn("[scan] connected read:", (e as Error).message), null)) : null;
  const videos = connected ? read.videos.map((v) => ({ ...v, ...(connected.videos.get(v.videoId) ?? {}) })) : read.videos;
  await saveVideos(sb, c.id, videos, c.handle);
  const author = { ...me, ...(connected?.author ?? {}) };
  await snapFollowers(sb, c.id, [author]);
  const update: Partial<Creator> = {
    display_name: author.displayName,
    avatar_url: author.avatarUrl,
    bio: author.bio,
    followers: author.followers,
    following: author.following,
    hearts: author.hearts,
    videos: author.videos,
  };
  const stale = !c.profile || !c.last_scan_at || Date.now() - Date.parse(c.last_scan_at) > PROFILE_EVERY_MS;
  if (stale && isModelConfigured) {
    const own = (await listVideos(sb, c.id, 180)).filter((v) => v.is_self);
    const normal = normalOf(own);
    const account = await readAccount({
      handle: c.handle,
      name: author.displayName,
      bio: author.bio,
      followers: author.followers,
      videos: own.slice(0, 30).map((v) => videoLine(v, timesNormal(v.views, normal))),
    });
    update.profile = { niche: account.niche, audience: account.audience, works: account.works, doesnt: account.doesnt, style: account.style };
    // The owner's hashtags stand; the model's fill an empty list.
    if (!c.hashtags.length) update.hashtags = account.hashtags.map((t) => t.replace(/^#/, "").toLowerCase()).filter((t) => t && !BROAD.has(t)).slice(0, 8);
  }
  await sb.from("creators").update(update).eq("id", c.id);
}

/** Tags too broad to say anything about a niche. */
const BROAD = new Set(["fyp", "foryou", "foryoupage", "viral", "trending", "tiktok", "explore", "xyzbca", "fy"]);

async function peersStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const tags = c.hashtags.slice(0, NICHE_TAGS_READ);
  const sample = await readHashtags(tags, 30);
  await saveVideos(sb, c.id, sample.videos, c.handle);

  const { data: peerRows } = await sb.from("peers").select("*").eq("creator_id", c.id);
  let peers = (peerRows ?? []) as Peer[];
  if (peers.length < MIN_PEERS) {
    const niche = new Set(c.hashtags);
    const byAuthor = new Map<string, PeerCandidate>();
    for (const v of sample.videos) {
      const a = byAuthor.get(v.author) ?? { handle: v.author, followers: sample.authors.get(v.author)?.followers ?? null, tags: 0, videos: 0 };
      a.videos++;
      byAuthor.set(v.author, a);
    }
    for (const a of byAuthor.values()) a.tags = new Set(sample.videos.filter((v) => v.author === a.handle).flatMap((v) => v.hashtags).filter((t) => niche.has(t))).size;
    const taken = new Set(peers.map((p) => p.handle));
    const picks = rankPeers([...byAuthor.values()].filter((p) => !taken.has(p.handle)), { handle: c.handle, followers: c.followers }, MAX_PEERS - peers.length);
    if (picks.length) {
      const rows = picks.map((p) => ({
        creator_id: c.id,
        handle: p.handle,
        display_name: sample.authors.get(p.handle)?.displayName ?? null,
        avatar_url: sample.authors.get(p.handle)?.avatarUrl ?? null,
        followers: p.followers,
        reason: `Posts in ${p.tags} of your niche hashtags`,
        source: "match",
      }));
      const { data } = await sb.from("peers").upsert(rows, { onConflict: "creator_id,handle", ignoreDuplicates: true }).select("*");
      peers = [...peers, ...((data ?? []) as Peer[])];
    }
  }
  if (!peers.length) return;
  const read = await readProfiles(
    peers.map((p) => p.handle),
    15,
  );
  await saveVideos(sb, c.id, read.videos, c.handle);
  await snapFollowers(sb, c.id, [...read.authors.values()]);
  const now = new Date().toISOString();
  await Promise.all(
    peers.map((p) => {
      const a = read.authors.get(p.handle);
      return sb
        .from("peers")
        .update(a ? { display_name: a.displayName, avatar_url: a.avatarUrl, followers: a.followers, last_read_at: now, last_error: null } : { last_error: "Couldn't read this account. It may be private or renamed." })
        .eq("id", p.id);
    }),
  );
}

async function trendsStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const videos = await listVideos(sb, c.id, 14);
  const rows = trendRows(videos).slice(0, 60);
  const cc = await readCreativeCenter(null);
  const ccViews = new Map(cc.map((t) => [t.tag, t.views]));
  if (!rows.length) return;
  await sb.from("trend_snapshots").upsert(
    rows.map((r) => ({
      creator_id: c.id,
      kind: r.kind,
      key: r.key,
      label: r.label,
      recent: r.recent,
      prior: r.prior,
      views: r.views,
      total_views: r.kind === "hashtag" ? (ccViews.get(r.key) ?? null) : null,
      captured_on: today(),
    })),
    { onConflict: "creator_id,kind,key,captured_on" },
  );
}

/** Ideas the creator added: matched to the video they became, then checked once it has had 48 hours. */
async function checkRuns(sb: SupabaseClient, c: Creator, own: Video[]): Promise<IdeaRun[]> {
  const { data } = await sb.from("idea_runs").select("*").eq("creator_id", c.id).order("added_at", { ascending: false }).limit(30);
  const runs = (data ?? []) as IdeaRun[];
  const taken = new Set(runs.map((r) => r.video_id).filter((id): id is string => Boolean(id)));
  const byId = new Map(own.map((v) => [v.id, v]));
  for (const r of runs) {
    if (r.status === "planned") {
      const v = matchIdea(r, own, taken);
      if (v) {
        taken.add(v.id);
        r.video_id = v.id;
        r.status = "posted";
        r.matched_at = new Date().toISOString();
        await sb.from("idea_runs").update({ video_id: v.id, status: "posted", matched_at: r.matched_at }).eq("id", r.id);
      }
    }
    const v = r.video_id ? byId.get(r.video_id) : null;
    if (r.status === "posted" && v?.posted_at && Date.now() - Date.parse(v.posted_at) >= SETTLE_HOURS * 3_600_000) {
      r.result = { views: v.views, likes: v.likes, comments: v.comments, saves: v.saves, read: outcomeOf(v.views, r.expected) ?? "in_range" };
      r.status = "checked";
      r.checked_at = new Date().toISOString();
      await sb.from("idea_runs").update({ status: "checked", result: r.result, checked_at: r.checked_at }).eq("id", r.id);
    }
  }
  return runs;
}

async function planStage(sb: SupabaseClient, c: Creator): Promise<PlanBody | null> {
  const videos = await listVideos(sb, c.id, 120);
  const own = videos.filter((v) => v.is_self);
  const runs = await checkRuns(sb, c, own);
  if (!isModelConfigured) return null;
  const { data: last } = await sb.from("plans").select("created_at").eq("creator_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && !c.plan_requested && Date.now() - Date.parse(last.created_at) < PLAN_EVERY_MS) return null;

  const { data: peerRows } = await sb.from("peers").select("handle").eq("creator_id", c.id);
  const peerSet = new Set((peerRows ?? []).map((p) => p.handle as string));
  const recentPeer = videos.filter((v) => !v.is_self && peerSet.has(v.author) && v.posted_at && Date.now() - Date.parse(v.posted_at) < 21 * 86_400_000);
  const untagged = [...own.slice(0, 40), ...recentPeer].filter((v) => !v.format);
  if (untagged.length) {
    const tags = await tagVideos(untagged.slice(0, 120));
    await Promise.all(
      [...tags].map(([videoId, t]) => {
        const v = videos.find((x) => x.video_id === videoId);
        if (v) Object.assign(v, t);
        return sb.from("videos").update(t).eq("creator_id", c.id).eq("video_id", videoId);
      }),
    );
  }

  const normal = normalOf(own);
  const ranked = own
    .slice(0, 40)
    .map((v) => ({ v, x: timesNormal(v.views, normal) }))
    .sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const ownLines = [...ranked.slice(0, 12), ...ranked.slice(-5)].filter((r, i, all) => all.findIndex((o) => o.v.id === r.v.id) === i).map((r) => videoLine(r.v, r.x));
  const normals = new Map<string, ReturnType<typeof normalOf>>();
  for (const h of peerSet) normals.set(h, normalOf(videos.filter((v) => v.author === h)));
  const borrow = recentPeer
    .map((v) => ({ v, ...borrowScore(v, normals.get(v.author)!, c.hashtags) }))
    .filter((b) => b.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((b) => `${videoLine(b.v, b.times)} · borrow score ${b.score}`);
  const trends = trendRows(videos.filter((v) => v.posted_at && Date.now() - Date.parse(v.posted_at) < 14 * 86_400_000))
    .filter((t) => t.stage === "early" || t.stage === "rising" || t.stage === "peaking")
    .slice(0, 14)
    .map((t) => `[${t.key}] ${t.kind} ${t.label}: ${t.recent} videos this week, ${t.prior} last week, ${t.creators} creators, ${t.stage}`);
  const past = runs
    .filter((r) => r.status === "checked" && r.result)
    .slice(0, 6)
    .map((r) => `"${r.idea.hook}" (${r.idea.type}): ${r.result!.views?.toLocaleString("en-US") ?? "?"} views against a usual ${r.expected?.low ?? "?"}-${r.expected?.high ?? "?"}: ${r.result!.read.replace("_", " ")}`);

  const body = await writePlan({
    handle: c.handle,
    followers: c.followers,
    profile: c.profile,
    goals: c.goals,
    today: today(),
    normal: { views: normal.views, low: normal.low, high: normal.high, perWeek: postsPerWeek(own.slice(0, 30)) },
    own: ownLines,
    borrow,
    trends,
    past,
  });
  // A source the model named that we never gave it is dropped, not shown as evidence.
  const known = new Set(videos.map((v) => v.video_id));
  const trendKeys = new Set(trends.map((t) => t.slice(1, t.indexOf("]"))));
  body.ideas = body.ideas.slice(0, 3).map((i) => ({ ...i, source_video: known.has(i.source_video) ? i.source_video : "", source_trend: trendKeys.has(i.source_trend) ? i.source_trend : "" }));
  body.patterns = body.patterns.map((p) => ({ ...p, videos: p.videos.filter((id) => known.has(id)) }));
  await sb.from("plans").insert({ creator_id: c.id, body });
  await sb.from("creators").update({ plan_requested: false }).eq("id", c.id);
  return body;
}

/* --------------------------------- run ------------------------------------ */

/** Starts the next stage in a fresh function: the cron route, called for this one creator. */
async function handOff(creatorId: string): Promise<void> {
  if (!env.cronSecret) return;
  await fetch(`${env.siteUrl}/api/cron/scan?creator=${creatorId}&resume=1`, {
    headers: { authorization: `Bearer ${env.cronSecret}` },
    signal: AbortSignal.timeout(4000),
  }).catch(() => {
    // The request is out; the timeout only stops this function from waiting for the scan it started.
  });
}

/** A scan this long without progress died with its function. */
export const SCAN_STALE_MS = 10 * 60_000;

export async function scanCreator(creatorId: string, opts: { resume?: boolean; budgetMs?: number } = {}): Promise<ScanResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const sb = adminSupabase();
  const load = async () => {
    const { data } = await sb.from("creators").select("*").eq("id", creatorId).maybeSingle<Creator>();
    if (!data) throw new Error("No such creator");
    return data;
  };
  let c = await load();
  const result: ScanResult = { creator: c.handle, stages: [], handedOff: false };
  if (planState(c).locked) return { ...result, error: "Trial ended" };
  if (!isTiktokConfigured()) {
    await sb.from("creators").update({ scan_status: "error", scan_error: "TikTok reads are not set up on this deployment (APIFY_TOKEN).", scan_stage: null }).eq("id", c.id);
    return { ...result, error: "APIFY_TOKEN not set" };
  }
  const fresh = c.scan_status === "running" && c.scan_started_at && Date.now() - Date.parse(c.scan_started_at) < SCAN_STALE_MS;
  if (fresh && !opts.resume) return { ...result, error: "Already running" };
  const resuming = c.scan_status === "running" && c.scan_stage;
  const from = resuming ? STAGES.indexOf(c.scan_stage!) : 0;
  await sb
    .from("creators")
    .update({ scan_status: "running", scan_stage: STAGES[from], scan_started_at: new Date().toISOString(), scan_error: null })
    .eq("id", c.id);

  try {
    for (let i = from; i < STAGES.length; i++) {
      const stage = STAGES[i];
      if (i > from && Date.now() - started > budget) {
        await sb.from("creators").update({ scan_stage: stage, scan_started_at: new Date().toISOString() }).eq("id", c.id);
        await handOff(c.id);
        return { ...result, handedOff: true };
      }
      await sb.from("creators").update({ scan_stage: stage, scan_started_at: new Date().toISOString() }).eq("id", c.id);
      c = await load();
      if (stage === "profile") await profileStage(sb, c);
      else if (stage === "peers") await peersStage(sb, c);
      else if (stage === "trends") await trendsStage(sb, c);
      else {
        const first = !c.last_scan_at;
        const body = await planStage(sb, c);
        if (body && !first) await sendPlanEmail(sb, c, body).catch((e) => console.warn("[scan] email:", (e as Error).message));
      }
      result.stages.push(stage);
    }
    await sb.from("creators").update({ scan_status: "idle", scan_stage: null, scan_error: null, last_scan_at: new Date().toISOString() }).eq("id", c.id);
    return result;
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[scan] @${c.handle}:`, message);
    await sb.from("creators").update({ scan_status: "error", scan_stage: null, scan_error: message }).eq("id", c.id);
    return { ...result, error: message };
  }
}
