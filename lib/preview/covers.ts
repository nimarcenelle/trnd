import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import type { ReadVideo } from "@/lib/tiktok/read";

/**
 * Our own copy of each read video's cover. TikTok's image links expire within
 * hours, so the cover is fetched once at read time, shrunk to a small JPEG and
 * kept in a public Storage bucket by video id. Any failure skips that cover:
 * the tile shows a colored block with the view count instead.
 */

export const COVER_BUCKET = "covers";
/** Wide enough for a tile in a 3-column grid on a 2× screen. */
const COVER_WIDTH = 240;
/** A cover bigger than this is not a cover. */
const MAX_BYTES = 3_000_000;
/** The covers share the read step's function with the Apify read: stop starting new ones after this. */
const BUDGET_MS = 20_000;

/** TikTok's image hosts. A cover link pointing anywhere else is not fetched. */
const HOSTS = /(^|\.)(tiktokcdn(-us|-eu)?\.com|ibyteimg\.com|ibytedtos\.com|byteimg\.com|muscdn\.com)$/i;

export function isCoverUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Where a video's cover lives in the bucket; null for an id we would not put in a path. */
export function coverPath(videoId: string): string | null {
  return /^[0-9A-Za-z_-]{1,64}$/.test(videoId) ? `${videoId}.jpg` : null;
}

async function storeCover(v: ReadVideo): Promise<string | null> {
  const path = coverPath(v.videoId);
  if (!path || !isCoverUrl(v.coverUrl)) return null;
  const res = await fetch(v.coverUrl, { signal: AbortSignal.timeout(8_000), redirect: "error", cache: "no-store" });
  if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  const input = Buffer.from(await res.arrayBuffer());
  if (!input.byteLength || input.byteLength > MAX_BYTES) return null;
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(input).resize({ width: COVER_WIDTH, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  const bucket = adminSupabase().storage.from(COVER_BUCKET);
  const { error } = await bucket.upload(path, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) return null;
  return bucket.getPublicUrl(path).data.publicUrl || null;
}

/** The videos with `storedCover` set on each one whose cover was stored; the rest unchanged. */
export async function storeCovers(videos: ReadVideo[], concurrency = 6, now = Date.now): Promise<ReadVideo[]> {
  const out = [...videos];
  const until = now() + BUDGET_MS;
  let next = 0;
  const worker = async () => {
    while (next < out.length && now() < until) {
      const i = next++;
      const url = await storeCover(out[i]).catch(() => null);
      if (url) out[i] = { ...out[i], storedCover: url };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, out.length) }, worker));
  return out;
}
