import { env } from "@/lib/env";
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(200_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apify ${actor} answered ${res.status}`);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? items.filter(isObj) : [];
}

/** Every profile asked for, in one actor run per platform. */
export async function readSocial(handles: { instagram: string[]; tiktok: string[] }): Promise<SocialRead[]> {
  if (!env.apifyToken) return [];
  const ig = [...new Set(handles.instagram.map(normHandle))].filter(Boolean);
  const tt = [...new Set(handles.tiktok.map(normHandle))].filter(Boolean);
  const [igItems, ttItems] = await Promise.all([
    ig.length ? runActor(IG_ACTOR, { usernames: ig }).catch((e) => (console.warn("[social] instagram:", (e as Error).message), [])) : [],
    tt.length ? runActor(TT_ACTOR, { profiles: tt, resultsPerPage: RECENT, shouldDownloadVideos: false, shouldDownloadCovers: false }).catch((e) => (console.warn("[social] tiktok:", (e as Error).message), [])) : [],
  ]);
  return [...igItems.map(mapInstagram).filter((r): r is SocialRead => r !== null), ...mapTiktok(ttItems)];
}
