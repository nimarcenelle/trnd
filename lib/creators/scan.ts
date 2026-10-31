import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAccount, tagVideos, videoLine, writePlan } from "@/lib/ai/creators";
import { planState } from "@/lib/billing";
import { allRows } from "@/lib/db/rows";
import { adminSupabase } from "@/lib/db/supabase";
import type { Creator, IdeaRun, Peer, PlanBody, ScanStage, Video } from "@/lib/db/types";
import { MAX_PEERS } from "@/lib/db/types";
import { sendPlanEmail } from "@/lib/email";
import { friendlyScanError, RESUME_WITHIN_MS } from "./guards";
import { env, isModelConfigured } from "@/lib/env";
import { todayIso } from "@/lib/format";
import { readConnected } from "@/lib/tiktok/connect";
import { isTiktokConfigured, readCreativeCenter, readHashtags, readProfiles, type ReadAuthor, type ReadVideo } from "@/lib/tiktok/read";

import { aheadBand, aheadLine, borrowScore, matchIdea, normalOf, outcomeOf, postsPerWeek, rankPeers, SETTLE_HOURS, timesNormal, trendRows, type PeerCandidate } from "./stats";

/**
 * One scan, in six stages, each saved before the next starts so a scan cut
 * short picks up where it stopped:
 *   profile: the creator's own videos and numbers, and (weekly) the model's read of the account
 *   niche:   videos under the niche hashtags; creators ahead of them picked from those
 *   peers:   each peer's recent videos
 *   trends:  hashtags and sounds across everything read in the last 14 days, staged and snapshotted
 *   tag:     when a plan is due, the format and hook of videos not yet tagged
 *   plan:    ideas posted since the last scan matched and checked; when due, the plan written
 * Each stage makes at most one slow call (an Apify read or a model call, each
 * bounded near two minutes), so any one stage fits in a 300s function. A
 * stage that would start past the budget hands the rest to a fresh function.
 */

const STAGES: ScanStage[] = ["profile", "niche", "peers", "trends", "tag", "plan"];
/** A stage starts in this function only this soon after it began; later ones go to a fresh function. */
const DEFAULT_BUDGET_MS = 60_000;
/** The model re-reads the account once a week; numbers are read every scan. */
const PROFILE_EVERY_MS = 7 * 86_400_000;
/** Matched peers are looked for again when fewer than this remain. */
const MIN_PEERS = 4;
const NICHE_TAGS_READ = 4;
/** Reads are daily; a new plan (and its email) is weekly, unless the creator asks for one. */
const PLAN_EVERY_MS = 6.5 * 86_400_000;
/** Videos tagged per scan: one model call. The rest are tagged on the next. */
const TAG_PER_SCAN = 60;
/** A posted idea whose numbers never come in is given up on after this. */
const GIVE_UP_MS = 7 * 86_400_000;

export interface ScanResult {
  creator: string;
  stages: ScanStage[];
  handedOff: boolean;
  error?: string;
}

const today = () => todayIso();
const DAY = 86_400_000;
const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();

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

/**
 * The creator's own videos the numbers are read from: the last 120 days, or, for
 * someone who posts rarely (fewer than 5 in that window), their latest 12 whenever
 * posted. One video is no "usual".
 */
export async function ownVideos(sb: SupabaseClient, creatorId: string): Promise<Video[]> {
  const recent = await listVideos(sb, creatorId, 120, { self: true });
  return recent.length >= 5 ? recent : (await listVideos(sb, creatorId, 3650, { self: true })).slice(0, 12);
}

/** Videos posted in the last `days`, newest first, every page of them; `self` and `authors` narrow it. */
async function listVideos(sb: SupabaseClient, creatorId: string, days: number, opts: { self?: boolean; authors?: string[] } = {}): Promise<Video[]> {
  if (opts.authors && !opts.authors.length) return [];
  return allRows<Video>((from, to) => {
    let q = sb.from("videos").select("*").eq("creator_id", creatorId).gte("posted_at", since(days));
    if (opts.self !== undefined) q = q.eq("is_self", opts.self);
    if (opts.authors) q = q.in("author", opts.authors);
    return q.order("posted_at", { ascending: false }).order("id").range(from, to);
  });
}

async function livePeers(sb: SupabaseClient, creatorId: string): Promise<Peer[]> {
  const { data, error } = await sb.from("peers").select("*").eq("creator_id", creatorId);
  if (error) throw new Error(`Reading creators ahead of you failed: ${error.message}`);
  return ((data ?? []) as Peer[]).filter((p) => !p.removed_at);
}

/** Copies only the numbers a source actually gave: a missing field never blanks a good one. */
function overlay<T extends object>(base: T, extra: Partial<T> | undefined): T {
  if (!extra) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** A plan is due when there is none, the creator asked for one, or the last is a week old. */
async function planDue(sb: SupabaseClient, c: Creator): Promise<boolean> {
  if (c.plan_requested) return true;
  const { data } = await sb.from("plans").select("created_at").eq("creator_id", c.id).order("created_at", { ascending: false }).limit(1);
  const last = data?.[0]?.created_at as string | undefined;
  return !last || Date.now() - Date.parse(last) >= PLAN_EVERY_MS;
}

/* -------------------------------- stages ---------------------------------- */

async function profileStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const read = await readProfiles([c.handle], 30);
  const me = read.authors.get(c.handle);
  // A read that died says nothing about the account: the last read stands and the next scan tries again.
  if (!me && read.unread.includes(c.handle)) throw new Error("TikTok didn't answer this time. Nothing is lost: try again in a few minutes.");
  if (!me) throw new Error(`We couldn't read @${c.handle} on TikTok. Check the handle, and that the account is public.`);
  // A connected account's own numbers, straight from TikTok, over the public read where both exist.
  const connected = c.tiktok_connected_at ? await readConnected(c.id).catch((e) => (console.warn("[scan] connected read:", (e as Error).message), null)) : null;
  const videos = read.videos.map((v) => overlay(v, connected?.videos.get(v.videoId)));
  await saveVideos(sb, c.id, videos, c.handle);
  const author = overlay(me, connected?.author);
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
  const stale = !c.profile || !c.hashtags.length || !c.profile_read_at || Date.now() - Date.parse(c.profile_read_at) > PROFILE_EVERY_MS;
  if (stale && isModelConfigured) {
    const own = await ownVideos(sb, c.id);
    const normal = normalOf(own);
    const account = await readAccount({
      handle: c.handle,
      name: author.displayName,
      bio: author.bio,
      followers: author.followers,
      videos: own.slice(0, 30).map((v) => videoLine(v, timesNormal(v.views, normal))),
    });
    update.profile = { niche: account.niche, audience: account.audience, works: account.works, doesnt: account.doesnt, style: account.style };
    update.profile_read_at = new Date().toISOString();
    // The owner's hashtags stand; the model's fill an empty list.
    if (!c.hashtags.length) update.hashtags = account.hashtags.map((t) => t.replace(/^#/, "").toLowerCase()).filter((t) => t && !BROAD.has(t)).slice(0, 8);
  }
  const { error } = await sb.from("creators").update(update).eq("id", c.id);
  if (error) throw new Error(`Saving your profile failed: ${error.message}`);
}

/** Tags too broad to say anything about a niche. */
const BROAD = new Set(["fyp", "foryou", "foryoupage", "viral", "trending", "tiktok", "explore", "xyzbca", "fy"]);

/**
 * The niche sample: recent videos under the niche hashtags, and creators ahead
 * of you picked from it. A short list is filled; a full one swaps matched
 * creators no bigger than you for ones ahead of you, one for one, smallest out
 * first. Creators the owner added are never swapped.
 */
export async function nicheStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const tags = c.hashtags.slice(0, NICHE_TAGS_READ);
  if (!tags.length) return;
  const sample = await readHashtags(tags, 30);
  await saveVideos(sb, c.id, sample.videos, c.handle);

  const { data: all } = await sb.from("peers").select("id, handle, source, followers, removed_at").eq("creator_id", c.id);
  const known = (all ?? []) as Pick<Peer, "id" | "handle" | "source" | "followers" | "removed_at">[];
  const live = known.filter((p) => !p.removed_at);
  const niche = new Set(c.hashtags);
  const byAuthor = new Map<string, PeerCandidate & { seen: Set<string> }>();
  for (const v of sample.videos) {
    const a = byAuthor.get(v.author) ?? { handle: v.author, followers: sample.authors.get(v.author)?.followers ?? null, tags: 0, videos: 0, seen: new Set<string>() };
    a.videos++;
    for (const t of v.hashtags) if (niche.has(t)) a.seen.add(t);
    a.tags = a.seen.size;
    byAuthor.set(v.author, a);
  }
  // Anyone already listed, including peers the owner removed, is never picked again.
  const taken = new Set(known.map((p) => p.handle));
  const ranked = rankPeers([...byAuthor.values()].filter((p) => !taken.has(p.handle)), { handle: c.handle, followers: c.followers }, MAX_PEERS);
  const fill = live.length < MIN_PEERS ? ranked.slice(0, MAX_PEERS - live.length) : [];
  const band = aheadBand(c.followers);
  const isAhead = (followers: number | null) => followers !== null && followers >= band.min;
  const behind = live.filter((p) => p.source !== "owner" && !isAhead(p.followers)).sort((a, b) => (a.followers ?? 0) - (b.followers ?? 0));
  const swapIn = ranked.filter((p) => isAhead(p.followers) && !fill.includes(p)).slice(0, behind.length);
  const out = behind.slice(0, swapIn.length);
  const picks = [...fill, ...swapIn];
  if (!picks.length) return;
  if (out.length) {
    const { error } = await sb.from("peers").update({ removed_at: new Date().toISOString() }).in("id", out.map((p) => p.id));
    if (error) throw new Error(`Making room for creators ahead of you failed: ${error.message}`);
  }
  const rows = picks.map((p) => ({
    creator_id: c.id,
    handle: p.handle,
    display_name: sample.authors.get(p.handle)?.displayName ?? null,
    avatar_url: sample.authors.get(p.handle)?.avatarUrl ?? null,
    followers: p.followers,
    reason: [aheadLine(p.followers, c.followers), `posts in ${p.tags} of your niche hashtags`].filter(Boolean).join(" · ").replace(/^p/, "P"),
    source: "match",
  }));
  const { error } = await sb.from("peers").upsert(rows, { onConflict: "creator_id,handle", ignoreDuplicates: true });
  if (error) throw new Error(`Saving creators ahead of you failed: ${error.message}`);
}

async function peersStage(sb: SupabaseClient, c: Creator): Promise<void> {
  const peers = await livePeers(sb, c.id);
  if (!peers.length) return;
  const read = await readProfiles(
    peers.map((p) => p.handle),
    15,
  );
  await saveVideos(sb, c.id, read.videos, c.handle);
  await snapFollowers(sb, c.id, [...read.authors.values()]);
  const now = new Date().toISOString();
  // A peer whose run died keeps its last read and note: it is not "private or renamed" on that alone.
  const unread = new Set(read.unread);
  await Promise.all(
    peers
      .filter((p) => !unread.has(p.handle))
      .map((p) => {
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
  if (!rows.length) return;
  const cc = await readCreativeCenter(null);
  const ccViews = new Map(cc.map((t) => [t.tag, t.views]));
  const { error } = await sb.from("trend_snapshots").upsert(
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
  if (error) throw new Error(`Saving trends failed: ${error.message}`);
}

/** When a plan is due: the format and opening line of the videos it will be written from, one model call's worth. */
async function tagStage(sb: SupabaseClient, c: Creator): Promise<void> {
  if (!isModelConfigured || !(await planDue(sb, c))) return;
  const own = await ownVideos(sb, c.id);
  const peers = await livePeers(sb, c.id);
  const theirs = await listVideos(
    sb,
    c.id,
    21,
    { authors: peers.map((p) => p.handle) },
  );
  const untagged = [...own.slice(0, 40), ...theirs].filter((v) => !v.format).slice(0, TAG_PER_SCAN);
  if (!untagged.length) return;
  const tags = await tagVideos(untagged);
  await Promise.all([...tags].map(([videoId, t]) => sb.from("videos").update(t).eq("creator_id", c.id).eq("video_id", videoId)));
}

/** Ideas the creator added: matched to the video they became, then checked once it has had 48 hours. */
async function checkRuns(sb: SupabaseClient, c: Creator, own: Video[]): Promise<IdeaRun[]> {
  const { data, error } = await sb.from("idea_runs").select("*").eq("creator_id", c.id).order("added_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Reading your ideas failed: ${error.message}`);
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
    if (r.status !== "posted" || !v?.posted_at || Date.now() - Date.parse(v.posted_at) < SETTLE_HOURS * 3_600_000) continue;
    // Too few videos when it was added: measured against the usual as it is now, without this video.
    const n = normalOf(own.filter((o) => o.id !== v.id));
    const expected = r.expected ?? (n.low !== null && n.high !== null ? { low: n.low, high: n.high } : null);
    const read = outcomeOf(v.views, expected);
    // No numbers to judge it by: wait for the next read, and give up after a week rather than make a verdict up.
    if (!read && Date.now() - Date.parse(v.posted_at) < GIVE_UP_MS) continue;
    r.expected = expected;
    r.result = { views: v.views, likes: v.likes, comments: v.comments, saves: v.saves, read: read ?? "unknown" };
    r.status = "checked";
    r.checked_at = new Date().toISOString();
    await sb.from("idea_runs").update({ status: "checked", expected, result: r.result, checked_at: r.checked_at }).eq("id", r.id);
  }
  return runs;
}

/** "#StudyTok" or "studytok" both name the trend keyed "studytok". */
const trendKey = (k: string) => k.trim().replace(/^#/, "").toLowerCase();

async function planStage(sb: SupabaseClient, c: Creator): Promise<PlanBody | null> {
  const own = await ownVideos(sb, c.id);
  const runs = await checkRuns(sb, c, own);
  if (!(await planDue(sb, c))) return null;
  if (!isModelConfigured) throw new Error("Plans aren't set up on this deployment yet (OPENAI_API_KEY).");

  const peers = await livePeers(sb, c.id);
  const peerVideos = await listVideos(
    sb,
    c.id,
    90,
    { authors: peers.map((p) => p.handle) },
  );
  const recentPeer = peerVideos.filter((v) => v.posted_at && Date.now() - Date.parse(v.posted_at) < 21 * DAY);
  const recent = await listVideos(sb, c.id, 14);

  const normal = normalOf(own);
  const ranked = own
    .slice(0, 40)
    .map((v) => ({ v, x: timesNormal(v.views, normal) }))
    .sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const ownLines = [...ranked.slice(0, 12), ...ranked.slice(-5)].filter((r, i, all) => all.findIndex((o) => o.v.id === r.v.id) === i).map((r) => videoLine(r.v, r.x));
  const normals = new Map(peers.map((p) => [p.handle, normalOf(peerVideos.filter((v) => v.author === p.handle))]));
  const borrow = recentPeer
    .map((v) => ({ v, ...borrowScore(v, normals.get(v.author)!, c.hashtags) }))
    .filter((b) => b.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const rising = trendRows(recent)
    .filter((t) => t.stage === "early" || t.stage === "rising" || t.stage === "peaking")
    .slice(0, 14);
  const past = runs
    .filter((r) => r.status === "checked" && r.result && r.result.read !== "unknown")
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
    borrow: borrow.map((b) => `${videoLine(b.v, b.times)} · borrow score ${b.score}`),
    trends: rising.map((t) => `[${t.key}] ${t.kind} ${t.label}: ${t.recent} videos this week, ${t.prior} last week, ${t.creators} creators, ${t.stage}`),
    past,
  });
  // A source must be one we gave the model, of the kind the idea claims; anything else is dropped, not shown as evidence.
  const ownIds = new Set(own.map((v) => v.video_id));
  const peerIds = new Set(recentPeer.map((v) => v.video_id));
  const trendKeys = new Map(rising.map((t) => [trendKey(t.key), t.key]));
  body.ideas = body.ideas.slice(0, 3).map((i) => ({
    ...i,
    source_video: (i.type === "double_down" ? ownIds : i.type === "borrow" ? peerIds : new Set<string>()).has(i.source_video) ? i.source_video : "",
    source_trend: i.type === "ride" ? (trendKeys.get(trendKey(i.source_trend)) ?? "") : "",
  }));
  if (!body.ideas.length) throw new Error("The plan came back without ideas. Read again to retry.");
  const known = new Set([...ownIds, ...peerIds]);
  body.patterns = body.patterns.map((p) => ({ ...p, videos: p.videos.filter((id) => known.has(id)) }));
  const { error } = await sb.from("plans").insert({ creator_id: c.id, body });
  if (error) throw new Error(`Saving the plan failed: ${error.message}`);
  await sb.from("creators").update({ plan_requested: false }).eq("id", c.id);
  return body;
}

/* --------------------------------- run ------------------------------------ */

/** Where a hand-off is sent: this deployment on a preview, the site otherwise. */
export const selfUrl = () => (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : env.siteUrl);

/**
 * A request to this app's cron route with its secret. Redirects are followed
 * by hand, the header kept on every hop: a fetch that follows a redirect to
 * another host (apex to www, say) drops the authorization header, and the
 * route then refuses the request it was meant to run. `timeoutMs` bounds the
 * whole request, hops included.
 */
export async function fetchSelf(url: string | URL, timeoutMs: number): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  let target = new URL(url);
  for (let hops = 0; ; hops++) {
    const res = await fetch(target, { headers: { authorization: `Bearer ${env.cronSecret}` }, redirect: "manual", signal, cache: "no-store" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location && hops < 3) {
      target = new URL(location, target);
      continue;
    }
    if (res.status === 401) console.warn(`[scan] ${target.host} refused the cron secret: check CRON_SECRET and NEXT_PUBLIC_SITE_URL`);
    return res;
  }
}

/**
 * Starts the next stage in a fresh function: the cron route, for this one
 * creator. True when the request went out (an answer, or our own timeout while
 * the scan it started runs on); false when it never reached the route, so the
 * caller carries on itself.
 */
async function handOff(creatorId: string): Promise<boolean> {
  if (!env.cronSecret) return false;
  try {
    const res = await fetchSelf(`${selfUrl()}/api/cron/scan?creator=${creatorId}&resume=1`, 10_000);
    return res.ok;
  } catch (err) {
    return (err as Error).name === "TimeoutError";
  }
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
  // A locked account gets its first read (the free plan everyone sees), and nothing after until it subscribes.
  if (planState(c).locked && c.last_scan_at) {
    if (c.scan_status === "running") await sb.from("creators").update({ scan_status: "idle", scan_stage: null }).eq("id", c.id);
    return { ...result, error: "Trial ended" };
  }
  if (!isTiktokConfigured()) {
    await sb.from("creators").update({ scan_status: "error", scan_error: "TikTok reads are not set up on this deployment (APIFY_TOKEN).", scan_stage: null }).eq("id", c.id);
    return { ...result, error: "APIFY_TOKEN not set" };
  }
  const fresh = c.scan_status === "running" && c.scan_started_at && Date.now() - Date.parse(c.scan_started_at) < SCAN_STALE_MS;
  if (fresh && !opts.resume) return { ...result, error: "Already running" };
  // A read cut short resumes where it stopped; so does one that failed recently, so a failed plan doesn't pay for every read again.
  const failedRecently = c.scan_status === "error" && c.scan_started_at && Date.now() - Date.parse(c.scan_started_at) < RESUME_WITHIN_MS;
  const at = (c.scan_status === "running" || failedRecently) && c.scan_stage ? STAGES.indexOf(c.scan_stage) : -1;
  const from = Math.max(0, at);
  const handle = c.handle;

  try {
    for (let i = from; i < STAGES.length; i++) {
      const stage = STAGES[i];
      await sb.from("creators").update({ scan_status: "running", scan_stage: stage, scan_started_at: new Date().toISOString(), scan_error: null }).eq("id", c.id);
      if (i > from && Date.now() - started >= budget && (await handOff(c.id))) return { ...result, handedOff: true };
      c = await load();
      // The handle changed under this scan: a new scan has started for the new account; this one stops.
      if (c.handle !== handle) return { ...result, error: "Handle changed" };
      if (stage === "profile") await profileStage(sb, c);
      else if (stage === "niche") await nicheStage(sb, c);
      else if (stage === "peers") await peersStage(sb, c);
      else if (stage === "trends") await trendsStage(sb, c);
      else if (stage === "tag") await tagStage(sb, c);
      else {
        const first = !c.last_scan_at;
        // Only the weekly plan is emailed: one asked for with "Read again now" is already on screen.
        const requested = c.plan_requested;
        const body = await planStage(sb, c);
        if (body && !first && !requested) await sendPlanEmail(sb, c, body).catch((e) => console.warn("[scan] email:", (e as Error).message));
      }
      result.stages.push(stage);
    }
    await sb.from("creators").update({ scan_status: "idle", scan_stage: null, scan_error: null, scan_failures: 0, last_scan_at: new Date().toISOString() }).eq("id", c.id).eq("handle", handle);
    return result;
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[scan] @${handle}:`, message);
    // scan_stage stays on the stage that failed, so a retry picks up there; the creator sees a plain message, the log keeps the raw one.
    await sb
      .from("creators")
      .update({ scan_status: "error", scan_error: friendlyScanError(message), scan_failures: (c.scan_failures ?? 0) + 1 })
      .eq("id", c.id)
      .eq("handle", handle);
    return { ...result, error: message };
  }
}
