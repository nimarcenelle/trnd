import "server-only";

import { readAccount, videoLine, writePlan } from "@/lib/ai/creators";
import { normalOf, postsPerWeek, rankPeers, timesNormal, trendRows } from "@/lib/creators/stats";
import { adminSupabase } from "@/lib/db/supabase";
import type { Creator, Goal, Video } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";
import { safeText, todayIso } from "@/lib/format";
import { normHandle, readHashtags, readProfiles, type ReadVideo } from "@/lib/tiktok/read";

import { storeCovers } from "./covers";
import { gate, visitorKey, type Gate } from "./limits";
import { MIN_VIDEOS, PREVIEW_TTL_MS, type Preview, type PreviewPeer, type PreviewStatus } from "./types";

/**
 * The free preview, run one step per request so each fits in a function:
 * the page calls the next step until the preview is ready. Steps:
 *   reading → confirm: the profile and last 24 videos (one Apify read)
 *   confirm → niche:   waits for the visitor to say "that's me"
 *   niche → idea:      the model's read of the account, the niche hashtags' recent videos (Apify), creators ahead of them, trends
 *   idea → ready:      the plan (one model call); the page shows idea 1 and blurs the rest
 */

/** A step that started longer ago than this died with its function and may be run again. */
const STEP_STALE_MS = 4 * 60_000;
/** Tags too broad to say anything about a niche. */
const BROAD = new Set(["fyp", "foryou", "foryoupage", "viral", "trending", "tiktok", "explore", "xyzbca", "fy"]);

/** A read video in the shape the shared arithmetic and prompts take. */
export function asVideo(v: ReadVideo, self: string): Video {
  return {
    id: v.videoId,
    creator_id: "",
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
    format: null,
    hook: null,
    first_seen_at: "",
    last_read_at: "",
  };
}

export async function getPreview(id: string): Promise<Preview | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminSupabase().from("previews").select("*").eq("id", id).maybeSingle<Preview>();
  return data;
}

async function bump(key: string): Promise<number> {
  const sb = adminSupabase();
  const day = todayIso();
  const { data } = await sb.from("preview_hits").select("count").eq("key", key).eq("day", day).maybeSingle();
  const count = ((data?.count as number | undefined) ?? 0) + 1;
  await sb.from("preview_hits").upsert({ key, day, count }, { onConflict: "key,day" });
  return count;
}

async function countToday(key: string): Promise<number> {
  const { data } = await adminSupabase().from("preview_hits").select("count").eq("key", key).eq("day", todayIso()).maybeSingle();
  return (data?.count as number | undefined) ?? 0;
}

/**
 * A preview for this handle: a recent one is reused at no cost; otherwise a
 * new one is started if this visitor and today's budget allow.
 */
export async function startPreview(rawHandle: string, ip: string | null): Promise<{ id: string } | { blocked: Exclude<Gate, { ok: true }>["reason"] }> {
  const handle = normHandle(rawHandle);
  const sb = adminSupabase();
  const since = new Date(Date.now() - PREVIEW_TTL_MS).toISOString();
  const { data: recent } = await sb.from("previews").select("id, status").eq("handle", handle).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  const reuse = recent?.[0];
  if (reuse && reuse.status !== "error") return { id: reuse.id as string };
  const visitor = visitorKey(ip);
  const g = gate(await countToday(visitor), await countToday("all"));
  if (!g.ok) return { blocked: g.reason };
  await Promise.all([bump(visitor), bump("all")]);
  const { data, error } = await sb.from("previews").insert({ handle, status: "reading" }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

/** Claims the current step: true when this request should run it (nobody else is, or the last runner died). */
async function claim(p: Preview): Promise<boolean> {
  const stale = new Date(Date.now() - STEP_STALE_MS).toISOString();
  const { data } = await adminSupabase()
    .from("previews")
    .update({ step_started_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("status", p.status)
    .or(`step_started_at.is.null,step_started_at.lt.${stale}`)
    .select("id");
  return Boolean(data?.length);
}

async function save(id: string, patch: Partial<Preview> & { status: PreviewStatus }): Promise<void> {
  await adminSupabase()
    .from("previews")
    .update({ ...patch, step_started_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Runs the preview's next step if it has one and nobody else is running it. Returns the preview after. */
export async function runStep(id: string): Promise<Preview | null> {
  const p = await getPreview(id);
  if (!p || !["reading", "niche", "idea"].includes(p.status)) return p;
  if (!(await claim(p))) return p;
  try {
    if (p.status === "reading") await readStep(p);
    else if (p.status === "niche") await nicheStep(p);
    else await ideaStep(p);
  } catch (err) {
    console.warn(`[preview] @${p.handle} ${p.status}:`, (err as Error).message);
    await save(p.id, { status: "error", reason: "Something went wrong reading this account. Try again in a minute." });
  }
  return getPreview(id);
}

async function readStep(p: Preview): Promise<void> {
  const read = await readProfiles([p.handle], 24);
  const author = read.authors.get(p.handle);
  if (!author) return save(p.id, { status: "ineligible", reason: "not_found" });
  const videos = read.videos.filter((v) => v.author === p.handle);
  if (videos.length < MIN_VIDEOS) return save(p.id, { status: "ineligible", reason: "few_videos", author, videos });
  await save(p.id, { status: "confirm", author, videos: await storeCovers(videos) });
}

/** "That's me": the rest of the preview runs. The goal, when tapped, shapes the plan. */
export async function confirmPreview(id: string, goal: Goal | null): Promise<void> {
  await adminSupabase()
    .from("previews")
    .update({ status: "niche", step_started_at: null, ...(goal ? { goal } : {}) })
    .eq("id", id)
    .eq("status", "confirm");
}

export async function setPreviewGoal(id: string, goal: Goal): Promise<void> {
  await adminSupabase().from("previews").update({ goal }).eq("id", id).in("status", ["niche", "idea"]);
}

async function nicheStep(p: Preview): Promise<void> {
  if (!isModelConfigured) throw new Error("OPENAI_API_KEY not set");
  const own = p.videos.map((v) => asVideo(v, p.handle));
  const normal = normalOf(own);
  const account = await readAccount({
    handle: p.handle,
    name: p.author?.displayName ?? null,
    bio: p.author?.bio ?? null,
    followers: p.author?.followers ?? null,
    videos: own.map((v) => videoLine(v, timesNormal(v.views, normal))),
  });
  const hashtags = account.hashtags.map((t) => t.replace(/^#/, "").toLowerCase()).filter((t) => t && !BROAD.has(t)).slice(0, 8);
  const sample = await readHashtags(hashtags.slice(0, 3), 25);
  const niche = new Set(hashtags);
  const byAuthor = new Map<string, { handle: string; followers: number | null; tags: number; videos: number; seen: Set<string> }>();
  for (const v of sample.videos) {
    if (v.author === p.handle) continue;
    const a = byAuthor.get(v.author) ?? { handle: v.author, followers: sample.authors.get(v.author)?.followers ?? null, tags: 0, videos: 0, seen: new Set<string>() };
    a.videos++;
    for (const t of v.hashtags) if (niche.has(t)) a.seen.add(t);
    a.tags = a.seen.size;
    byAuthor.set(v.author, a);
  }
  const picks = rankPeers([...byAuthor.values()], { handle: p.handle, followers: p.author?.followers ?? null }, 5);
  const peers: PreviewPeer[] = picks.map((c) => {
    const best = sample.videos.filter((v) => v.author === c.handle).sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    return {
      handle: c.handle,
      name: sample.authors.get(c.handle)?.displayName ?? null,
      followers: c.followers,
      best: best ? { videoId: best.videoId, hook: safeText((best.caption ?? "").replace(/#\S+/g, "").trim().slice(0, 120)), views: best.views, url: best.url } : null,
    };
  });
  const trends = trendRows(sample.videos.map((v) => asVideo(v, p.handle)))
    .filter((t) => t.stage !== "fading")
    .slice(0, 6);
  await save(p.id, {
    status: "idea",
    profile: { niche: account.niche, audience: account.audience, works: account.works, doesnt: account.doesnt, style: account.style },
    hashtags,
    peers,
    sample: sample.videos.filter((v) => v.author !== p.handle).slice(0, 80),
    trends,
  });
}

async function ideaStep(p: Preview): Promise<void> {
  if (!isModelConfigured) throw new Error("OPENAI_API_KEY not set");
  const own = p.videos.map((v) => asVideo(v, p.handle));
  const normal = normalOf(own);
  const ranked = own.map((v) => ({ v, x: timesNormal(v.views, normal) })).sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const peerSet = new Set(p.peers.map((x) => x.handle));
  const borrow = p.sample
    .filter((v) => peerSet.has(v.author))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 6)
    .map((v) => videoLine(asVideo(v, p.handle)));
  const body = await writePlan({
    handle: p.handle,
    followers: p.author?.followers ?? null,
    profile: p.profile,
    goals: { goal: (p.goal as Goal | null) ?? "followers", posts_per_week: "", target: "", notes: "" },
    today: todayIso(),
    normal: { views: normal.views, low: normal.low, high: normal.high, perWeek: postsPerWeek(own) },
    own: [...ranked.slice(0, 10), ...ranked.slice(-4)].map((r) => videoLine(r.v, r.x)),
    borrow,
    trends: p.trends.map((t) => `[${t.key}] ${t.kind} ${t.label}: ${t.recent} videos this week, ${t.prior} last week, ${t.creators} creators, ${t.stage}`),
    past: [],
  });
  const ownIds = new Set(own.map((v) => v.video_id));
  const peerIds = new Set(p.sample.filter((v) => peerSet.has(v.author)).map((v) => v.videoId));
  const keys = new Map(p.trends.map((t) => [t.key.toLowerCase(), t.key]));
  body.ideas = body.ideas.slice(0, 3).map((i) => ({
    ...i,
    source_video: (i.type === "double_down" ? ownIds : i.type === "borrow" ? peerIds : new Set<string>()).has(i.source_video) ? i.source_video : "",
    source_trend: i.type === "ride" ? (keys.get(i.source_trend.replace(/^#/, "").toLowerCase()) ?? "") : "",
  }));
  if (!body.ideas.length) throw new Error("empty plan");
  await save(p.id, { status: "ready", plan: body });
}

/**
 * A new account picks up its preview: the read videos, the account read, the
 * matched creators and the plan, so the app opens on a full plan at once.
 */
export async function claimPreview(previewId: string, creator: Pick<Creator, "id" | "handle">): Promise<boolean> {
  const p = await getPreview(previewId);
  if (!p || p.handle !== creator.handle || p.status !== "ready" || !p.plan || p.claimed_by) return false;
  const sb = adminSupabase();
  const now = new Date().toISOString();
  const rows = [...p.videos, ...p.sample.filter((v) => p.peers.some((x) => x.handle === v.author))].map((v) => {
    const { id: _id, first_seen_at: _f, ...row } = asVideo(v, p.handle);
    void _id;
    void _f;
    return { ...row, creator_id: creator.id, last_read_at: now };
  });
  if (rows.length) await sb.from("videos").upsert(rows, { onConflict: "creator_id,video_id", ignoreDuplicates: true });
  if (p.peers.length)
    await sb
      .from("peers")
      .upsert(
        p.peers.map((x) => ({ creator_id: creator.id, handle: x.handle, display_name: x.name, followers: x.followers, reason: "Posts in your niche hashtags", source: "match" })),
        { onConflict: "creator_id,handle", ignoreDuplicates: true },
      );
  const a = p.author;
  await sb
    .from("creators")
    .update({
      display_name: a?.displayName ?? null,
      avatar_url: a?.avatarUrl ?? null,
      bio: a?.bio ?? null,
      followers: a?.followers ?? null,
      following: a?.following ?? null,
      hearts: a?.hearts ?? null,
      videos: a?.videos ?? null,
      profile: p.profile,
      profile_read_at: now,
      hashtags: p.hashtags,
      last_scan_at: now,
    })
    .eq("id", creator.id);
  if (a?.followers !== null && a?.followers !== undefined) await sb.from("follower_snapshots").upsert({ creator_id: creator.id, handle: p.handle, followers: a.followers, captured_on: todayIso() }, { onConflict: "creator_id,handle,captured_on" });
  await sb.from("plans").insert({ creator_id: creator.id, body: p.plan });
  await sb.from("previews").update({ claimed_by: creator.id }).eq("id", p.id);
  return true;
}
