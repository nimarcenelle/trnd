import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Ad } from "@/lib/db/types";
import { fetchRetry } from "@/lib/retry";

/**
 * Copy ad images to our own storage. Facebook's CDN links carry a signature
 * that expires within days, after which the ad card goes blank: fatal in a
 * demo, and the archive is only worth something if its images last. Each
 * image is copied once (the poster frame for videos), up to a cap per run so a
 * first scan of a big advertiser stays quick; the rest follow on later scans.
 */

const BUCKET = "creatives";
const PER_RUN = 60;
const MAX_BYTES = 4_000_000;

/** Set when the bucket is missing, so one scan doesn't try sixty times per company. */
let bucketMissing = false;

const extOf = (type: string) => (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");

export async function storeCreatives(sb: SupabaseClient, ads: Pick<Ad, "id" | "archive_id" | "image_url" | "stored_image_url">[]): Promise<number> {
  // Rows read without the column mean 0106 hasn't run: nothing to store into yet.
  if (bucketMissing || !ads.length || !("stored_image_url" in ads[0])) return 0;
  const todo = ads.filter((a) => a.image_url && !a.stored_image_url && /^https:\/\//.test(a.image_url)).slice(0, PER_RUN);
  let stored = 0;
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (ad) => {
        try {
          const res = await fetchRetry(ad.image_url!, { timeoutMs: 15_000 });
          const type = res.headers.get("content-type") ?? "image/jpeg";
          if (!res.ok || !type.startsWith("image/")) return;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (!bytes.length || bytes.length > MAX_BYTES) return;
          const path = `ads/${ad.archive_id}.${extOf(type)}`;
          const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
          if (error) {
            if (/bucket not found/i.test(error.message)) bucketMissing = true;
            throw new Error(error.message);
          }
          const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          const { error: e2 } = await sb.from("ads").update({ stored_image_url: url }).eq("id", ad.id);
          if (e2) throw new Error(e2.message);
          stored++;
        } catch (err) {
          console.warn(`[creatives] ${ad.archive_id}:`, (err as Error).message);
        }
      }),
    );
  }
  return stored;
}
