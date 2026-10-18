import { env } from "@/lib/env";
import { assertApifyUp, noteApifyStatus } from "@/lib/apify";
import { NoRetry, withRetry } from "@/lib/retry";
import type { Platform, SocialPost } from "@/lib/db/types";

/**
 * Organic Instagram and TikTok presence, read through Apify (the same
 * APIFY_TOKEN as the Ad Library fallback). Without the token social is
 * skipped and the rest of the scan runs as before. Actor output fields drift,
 * so every field is optional and a renamed one degrades to a missing number,
 * never a crash.
 */

const IG_ACTOR = process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper";
const TT_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";
const FB_ACTOR = process.env.APIFY_FACEBOOK_POSTS_ACTOR || "apify~facebook-posts-scraper";
/** Facebook posts read per Page: enough to cover the ads it also posts organically. */
const FB_POSTS = 30;
const RECENT = 12;

export interface SocialRead {
  platform: Platform;
  handle: string;
  displayName: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  recent: SocialPost[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const when = (v: unknown): string | null => {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

export const normHandle = (h: string) => h.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, "").replace(/[/?#].*$/, "").toLowerCase();

/** Up to 8 comment texts from an actor's comment list. */
function commentTexts(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const texts = v.flatMap((c) => (isObj(c) ? (str(c.text) ?? []) : typeof c === "string" ? [c] : [])).map((t) => t.slice(0, 200));
  return texts.length ? texts.slice(0, 8) : undefined;
}

/** One Instagram profile item (apify/instagram-profile-scraper) → a read. */
export function mapInstagram(item: Obj): SocialRead | null {
  const handle = str(item.username);
  if (!handle) return null;
  const posts = Array.isArray(item.latestPosts) ? item.latestPosts.filter(isObj) : [];
  return {
    platform: "instagram",
    handle: handle.toLowerCase(),
    displayName: str(item.fullName),
    followers: num(item.followersCount),
    following: num(item.followsCount),
    posts: num(item.postsCount),
    recent: posts.slice(0, RECENT).map((p) => ({
      url: str(p.url),
      caption: str(p.caption)?.slice(0, 300) ?? null,
      posted_at: when(p.timestamp),
      likes: num(p.likesCount),
      comments: num(p.commentsCount),
      views: num(p.videoViewCount) ?? num(p.videoPlayCount),
      kind: str(p.type),
      top_comments: commentTexts(p.latestComments),
    })),
  };
}

/** TikTok video items (clockworks/tiktok-scraper), grouped by author → reads. */
export function mapTiktok(items: Obj[]): SocialRead[] {
  const byAuthor = new Map<string, SocialRead>();
  for (const v of items) {
    const author = isObj(v.authorMeta) ? v.authorMeta : {};
    const handle = (str(author.name) ?? str(author.uniqueId))?.toLowerCase();
    if (!handle) continue;
    let read = byAuthor.get(handle);
    if (!read) {
      read = {
        platform: "tiktok",
        handle,
        displayName: str(author.nickName) ?? str(author.nickname),
        followers: num(author.fans),
        following: num(author.following),
        posts: num(author.video),
        recent: [],
      };
      byAuthor.set(handle, read);
    }
    if (read.recent.length < RECENT) {
      read.recent.push({
        url: str(v.webVideoUrl),
        caption: str(v.text)?.slice(0, 300) ?? null,
        posted_at: when(v.createTimeISO ?? v.createTime),
        likes: num(v.diggCount),
        comments: num(v.commentCount),
        views: num(v.playCount),
        kind: "video",
      });
    }
  }
  return [...byAuthor.values()];
}

/** A Facebook Page's posts (apify/facebook-posts-scraper) → one read, keyed by the Page id we asked for. */
export function mapFacebook(pageId: string, items: Obj[]): SocialRead | null {
  const posts = items.filter((p) => str(p.text) ?? str(p.message));
  if (!posts.length) return null;
  const first = posts[0];
  const user = isObj(first.user) ? first.user : {};
  return {
    platform: "facebook",
    handle: pageId,
    displayName: str(first.pageName) ?? str(user.name),
    followers: null,
    following: null,
    posts: null,
    recent: posts.slice(0, FB_POSTS).map((p) => ({
      url: str(p.url) ?? str(p.postUrl) ?? str(p.topLevelUrl),
      caption: (str(p.text) ?? str(p.message))?.slice(0, 600) ?? null,
      posted_at: when(p.time ?? p.timestamp),
      likes: num(p.likes) ?? num(p.reactionsCount) ?? num(p.topReactionsCount),
      comments: num(p.comments) ?? num(p.commentsCount),
      shares: num(p.shares) ?? num(p.sharesCount),
      views: num(p.viewsCount),
      kind: str(p.type) ?? "post",
    })),
  };
}

/** Recent posts of each Facebook Page, one actor run per Page so each read keeps its Page id. */
export async function readFacebook(pageIds: string[]): Promise<SocialRead[]> {
  if (!env.apifyToken || !pageIds.length) return [];
  const reads = await Promise.all(
    pageIds.map((id) =>
      runActor(FB_ACTOR, { startUrls: [{ url: `https://www.facebook.com/${id}` }], resultsLimit: FB_POSTS })
        .then((items) => mapFacebook(id, items))
        .catch((e) => (console.warn(`[social] facebook ${id}:`, (e as Error).message), null)),
    ),
  );
  return reads.filter((r): r is SocialRead => r !== null);
}

/** Posts per week over the span the recent posts cover. */
export function postsPerWeek(recent: SocialPost[], now = Date.now()): number | null {
  const times = recent.map((p) => (p.posted_at ? Date.parse(p.posted_at) : NaN)).filter((t) => !Number.isNaN(t));
  if (times.length < 2) return null;
  const spanDays = Math.max(1, (now - Math.min(...times)) / 86_400_000);
  return Math.round((times.length / spanDays) * 7 * 10) / 10;
}

/** Mean (likes + comments) / followers across recent posts, as a fraction. */
export function engagementRate(recent: SocialPost[], followers: number | null): number | null {
  if (!followers) return null;
  const scored = recent.filter((p) => p.likes !== null || p.comments !== null);
  if (!scored.length) return null;
  const mean = scored.reduce((s, p) => s + (p.likes ?? 0) + (p.comments ?? 0), 0) / scored.length;
  return Math.round((mean / followers) * 10_000) / 10_000;
}

export interface Snapshot {
  profile_id: string;
  followers: number;
  captured_on: string;
}

export interface Growth {
  from: number;
  to: number;
  days: number;
}

/** First and last follower count per profile, and the days between them. */
export function growthBy(rows: Snapshot[]): Map<string, Growth> {
  const first = new Map<string, Snapshot>();
  const last = new Map<string, Snapshot>();
  for (const r of rows) {
    const f = first.get(r.profile_id);
    if (!f || r.captured_on < f.captured_on) first.set(r.profile_id, r);
    const l = last.get(r.profile_id);
    if (!l || r.captured_on > l.captured_on) last.set(r.profile_id, r);
  }
  const out = new Map<string, Growth>();
  for (const [id, f] of first) {
    const l = last.get(id)!;
    out.set(id, { from: f.followers, to: l.followers, days: Math.round((Date.parse(l.captured_on) - Date.parse(f.captured_on)) / 86_400_000) });
  }
  return out;
}

async function runActor(actor: string, input: Obj): Promise<Obj[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;
  return withRetry(async () => {
    assertApifyUp();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(200_000),
      cache: "no-store",
    });
    noteApifyStatus(res.status);
    // A 4xx (bad input, no credit) won't change on a second try.
    if (res.status >= 400 && res.status < 500) throw new NoRetry(`Apify ${actor} answered ${res.status}`);
    if (!res.ok) throw new Error(`Apify ${actor} answered ${res.status}`);
    const items = (await res.json()) as unknown;
    if (isObj(items) && isObj(items.error)) throw new NoRetry(`Apify ${actor}: ${str(items.error.message) ?? str(items.error.type) ?? "error"}`);
    return Array.isArray(items) ? items.filter(isObj) : [];
  });
}

/** Profiles per actor run. Ten Instagram profiles in one run outlasted the sync call and every one read as "not found". */
const PER_RUN = 3;

/**
 * Run the actor over `items` a few at a time, in parallel. Returns what came
 * back and whether every run finished: a run that failed or timed out says
 * nothing about the handles it carried, and the caller must not mark them
 * missing.
 */
async function runChunked(actor: string, items: string[], input: (chunk: string[]) => Obj): Promise<{ items: Obj[]; complete: boolean }> {
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += PER_RUN) chunks.push(items.slice(i, i + PER_RUN));
  const runs = await Promise.all(
    chunks.map((chunk) =>
      runActor(actor, input(chunk)).then(
        // Nothing back for a chunk of real handles is a run that gave up, not three missing profiles.
        (out) => (out.length ? { out, ok: true } : (console.warn(`[social] ${actor} (${chunk.join(", ")}): empty run`), { out, ok: false })),
        (e: Error) => (console.warn(`[social] ${actor} (${chunk.join(", ")}):`, e.message), { out: [] as Obj[], ok: false }),
      ),
    ),
  );
  return { items: runs.flatMap((r) => r.out), complete: runs.every((r) => r.ok) };
}

export interface SocialReads {
  reads: SocialRead[];
  /** Platforms whose every run finished, so a handle missing from `reads` has no public profile. */
  complete: Record<"instagram" | "tiktok", boolean>;
}

/** Every profile asked for, a few per actor run, with whether each platform's runs all finished. */
export async function readSocialWithStatus(handles: { instagram: string[]; tiktok: string[] }): Promise<SocialReads> {
  if (!env.apifyToken) return { reads: [], complete: { instagram: false, tiktok: false } };
  const ig = [...new Set(handles.instagram.map(normHandle))].filter(Boolean);
  const tt = [...new Set(handles.tiktok.map(normHandle))].filter(Boolean);
  const [igRun, ttRun] = await Promise.all([
    ig.length ? runChunked(IG_ACTOR, ig, (chunk) => ({ usernames: chunk })) : { items: [], complete: true },
    tt.length ? runChunked(TT_ACTOR, tt, (chunk) => ({ profiles: chunk, resultsPerPage: RECENT, shouldDownloadVideos: false, shouldDownloadCovers: false })) : { items: [], complete: true },
  ]);
  return {
    reads: [...igRun.items.map(mapInstagram).filter((r): r is SocialRead => r !== null), ...mapTiktok(ttRun.items)],
    complete: { instagram: igRun.complete, tiktok: ttRun.complete },
  };
}

/** Every profile asked for. */
export async function readSocial(handles: { instagram: string[]; tiktok: string[] }): Promise<SocialRead[]> {
  return (await readSocialWithStatus(handles)).reads;
}
