import { env } from "@/lib/env";
import { safeText } from "@/lib/format";

/**
 * Public TikTok reads through Apify (clockworks/tiktok-scraper by default):
 * a profile's recent videos, or the recent videos under a hashtag. Only what
 * anyone can see on TikTok: plays, likes, comments, shares and saves per
 * video, and an account's follower, heart and video counts. Watch time,
 * retention and followers gained per video are not public (see DATA.md).
 * Actor output fields drift, so every field is optional and a renamed one
 * degrades to a missing number, never a crash.
 */

const TT_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";
/** Optional: a Creative Center trending-hashtags actor. Unset, trends come from our own reads only. */
const TRENDS_ACTOR = process.env.APIFY_TIKTOK_TRENDS_ACTOR || "";

export interface ReadVideo {
  videoId: string;
  author: string;
  url: string | null;
  caption: string | null;
  hashtags: string[];
  sound: string | null;
  soundOriginal: boolean | null;
  durationS: number | null;
  coverUrl: string | null;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface ReadAuthor {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  hearts: number | null;
  videos: number | null;
}

export interface CreativeCenterTag {
  tag: string;
  rank: number;
  posts: number | null;
  views: number | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** A link from a read, shown as an href or an image: https only, so a scraped `javascript:` URL never reaches the page. */
const link = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\//i.test(s) ? s : null;
};
const when = (v: unknown): string | null => {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

/** "@Name", "name" or a profile URL → "name". */
export const normHandle = (h: string) =>
  h
    .trim()
    .replace(/^https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();

/** "#StudyTok", "studytok" → "studytok". */
export const normTag = (t: string) => t.trim().replace(/^#/, "").toLowerCase();

/** Hashtags written into a caption, in order, without repeats. */
export function captionTags(caption: string | null): string[] {
  return [...new Set((caption ?? "").match(/#[\p{L}\p{N}_]+/gu)?.map(normTag) ?? [])];
}

/** One video item → a read, or null when it has no id or author. */
export function mapVideo(item: Obj): ReadVideo | null {
  const id = str(item.id) ?? (num(item.id) !== null ? String(item.id) : null);
  const author = isObj(item.authorMeta) ? item.authorMeta : {};
  const handle = (str(author.name) ?? str(author.uniqueId))?.toLowerCase();
  if (!id || !handle) return null;
  const music = isObj(item.musicMeta) ? item.musicMeta : {};
  const meta = isObj(item.videoMeta) ? item.videoMeta : {};
  const listed = Array.isArray(item.hashtags) ? item.hashtags.flatMap((h) => (isObj(h) ? (str(h.name) ?? []) : typeof h === "string" ? [h] : [])).map(normTag) : [];
  const caption = str(item.text);
  const soundName = str(music.musicName);
  return {
    videoId: id,
    author: handle,
    url: link(item.webVideoUrl) ?? `https://www.tiktok.com/@${handle}/video/${id}`,
    caption: caption ? safeText(caption.slice(0, 500)) : null,
    hashtags: [...new Set([...listed, ...captionTags(caption)])].filter(Boolean),
    sound: soundName ? [soundName, str(music.musicAuthor)].filter(Boolean).join(" · ") : null,
    soundOriginal: typeof music.musicOriginal === "boolean" ? music.musicOriginal : null,
    durationS: num(meta.duration),
    coverUrl: link(meta.coverUrl) ?? link(meta.originalCoverUrl),
    postedAt: when(item.createTimeISO ?? item.createTime),
    views: num(item.playCount),
    likes: num(item.diggCount),
    comments: num(item.commentCount),
    shares: num(item.shareCount),
    saves: num(item.collectCount),
  };
}

/** The author block of a video item → the account's public numbers. */
export function mapAuthor(item: Obj): ReadAuthor | null {
  const a = isObj(item.authorMeta) ? item.authorMeta : null;
  const handle = a ? (str(a.name) ?? str(a.uniqueId))?.toLowerCase() : null;
  if (!a || !handle) return null;
  return {
    handle,
    displayName: str(a.nickName) ?? str(a.nickname),
    avatarUrl: link(a.avatar) ?? link(a.originalAvatarUrl),
    bio: str(a.signature),
    followers: num(a.fans),
    following: num(a.following),
    hearts: num(a.heart) ?? num(a.digg),
    videos: num(a.video),
  };
}

/** Every video in a run, deduplicated, and the latest numbers for each author in it. */
export function mapRun(items: Obj[]): { videos: ReadVideo[]; authors: Map<string, ReadAuthor> } {
  const videos = new Map<string, ReadVideo>();
  const authors = new Map<string, ReadAuthor>();
  for (const item of items) {
    const v = mapVideo(item);
    if (v && !videos.has(v.videoId)) videos.set(v.videoId, v);
    const a = mapAuthor(item);
    if (a && !authors.has(a.handle)) authors.set(a.handle, a);
  }
  return { videos: [...videos.values()], authors };
}

/** A Creative Center row → a tag with its rank; field names vary by actor, so several are tried. */
export function mapCreativeCenter(items: Obj[]): CreativeCenterTag[] {
  return items
    .map((it, i) => {
      const tag = str(it.hashtag_name) ?? str(it.hashtagName) ?? str(it.hashtag) ?? str(it.name);
      if (!tag) return null;
      return { tag: normTag(tag), rank: num(it.rank) ?? i + 1, posts: num(it.publish_cnt) ?? num(it.posts) ?? num(it.publishCount), views: num(it.video_views) ?? num(it.views) ?? num(it.viewCount) };
    })
    .filter((t): t is CreativeCenterTag => t !== null);
}

export const isTiktokConfigured = () => Boolean(env.apifyToken);

async function runActor(actor: string, input: Obj): Promise<Obj[]> {
  // The token goes in a header, not the URL, so no request log or error message carries it.
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.apifyToken}` },
    body: JSON.stringify(input),
    // Bounded so a scan stage with one read fits in its 300s function; a read cut short retries on the next scan.
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apify ${actor} answered ${res.status}`);
  const items = (await res.json()) as unknown;
  if (isObj(items) && isObj(items.error)) throw new Error(`Apify ${actor}: ${str(items.error.message) ?? str(items.error.type) ?? "error"}`);
  return Array.isArray(items) ? items.filter(isObj) : [];
}

const NO_MEDIA = { shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false };

/**
 * The recent videos of each profile, a few profiles per run so one slow profile cannot sink them all.
 * `failed`: handles a finished run came back without (private, renamed, or no such account).
 * `unread`: handles whose run died or timed out, or came back empty for several accounts at once:
 * a run that gave up, which says nothing about the accounts it carried.
 */
export async function readProfiles(handles: string[], perProfile = 30): Promise<{ videos: ReadVideo[]; authors: Map<string, ReadAuthor>; failed: string[]; unread: string[] }> {
  const list = [...new Set(handles.map(normHandle))].filter(Boolean);
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 3) chunks.push(list.slice(i, i + 3));
  const runs = await Promise.all(
    chunks.map((chunk) =>
      runActor(TT_ACTOR, { profiles: chunk, resultsPerPage: perProfile, profileScrapeSections: ["videos"], ...NO_MEDIA })
        .then((items) => {
          // One account missing may not exist; every account in a run missing is a run that gave up.
          if (!items.length && chunk.length > 1) console.warn(`[tiktok] ${chunk.join(", ")}: empty run`);
          return { chunk, items, ok: items.length > 0 || chunk.length === 1 };
        })
        .catch((e) => (console.warn(`[tiktok] ${chunk.join(", ")}:`, (e as Error).message), { chunk, items: [] as Obj[], ok: false })),
    ),
  );
  const { videos, authors } = mapRun(runs.flatMap((r) => r.items));
  const unread = new Set(runs.filter((r) => !r.ok).flatMap((r) => r.chunk));
  return { videos, authors, failed: list.filter((h) => !authors.has(h) && !unread.has(h)), unread: list.filter((h) => !authors.has(h) && unread.has(h)) };
}

/** Recent videos posted under each hashtag. */
export async function readHashtags(tags: string[], perTag = 40): Promise<{ videos: ReadVideo[]; authors: Map<string, ReadAuthor> }> {
  const list = [...new Set(tags.map(normTag))].filter(Boolean);
  if (!list.length) return { videos: [], authors: new Map() };
  const items = await runActor(TT_ACTOR, { hashtags: list, resultsPerPage: perTag, ...NO_MEDIA }).catch(
    (e) => (console.warn("[tiktok] hashtags:", (e as Error).message), [] as Obj[]),
  );
  return mapRun(items);
}

/** Trending hashtags from TikTok's Creative Center, when an actor for it is set. */
export async function readCreativeCenter(industry: string | null): Promise<CreativeCenterTag[]> {
  if (!TRENDS_ACTOR || !env.apifyToken) return [];
  const items = await runActor(TRENDS_ACTOR, { country: "US", period: 7, ...(industry ? { industry } : {}) }).catch(
    (e) => (console.warn("[tiktok] creative center:", (e as Error).message), [] as Obj[]),
  );
  return mapCreativeCenter(items);
}
