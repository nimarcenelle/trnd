import type { SocialPlatform } from "@/lib/db/types";
import { env } from "@/lib/env";

import { fetchFacebookPosts } from "./facebook";
import { fetchInstagramPosts } from "./instagram";
import type { SocialDraft } from "./read";
import { fetchTiktokPosts } from "./tiktok";

export type { AccountPost, AccountRead, SocialDraft, SocialMove } from "./read";
export { classifyPost, engagementOf, postsOnTerm, readAccount, rivalMoves } from "./read";

/** The whole social read is paid; without the key there is nothing to
 * show and nothing to apologise for — the surfaces stay hidden. */
export function isSocialReadAvailable(): boolean {
  return Boolean(env.apifyToken);
}

/** One platform's recent posts for one handle; [] when the platform is
 * unknown, the key is absent, or the actor failed (already warned). */
export async function fetchAccountPosts(platform: SocialPlatform, handle: string): Promise<SocialDraft[]> {
  const clean = normalizeHandle(platform, handle);
  if (!clean) return [];
  switch (platform) {
    case "instagram":
      return fetchInstagramPosts(clean);
    case "tiktok":
      return fetchTiktokPosts(clean);
    case "facebook":
      return fetchFacebookPosts(clean);
    default:
      return [];
  }
}

/** Facebook path segments that are a view of a Page, not the Page. */
const FACEBOOK_VIEWS = /\/(?:posts|photos|videos|reels|about|reviews|events|menu|community)(?:\/.*)?$/i;

/**
 * Owners paste whatever they have: "@bellwood", "instagram.com/bellwood/",
 * a full URL with tracking. Settings stores a bare, lowercased handle.
 * Facebook keeps its path because "pages/bellwood-coffee/1234" is a real
 * Page address (and "profile.php?id=" keeps its id); Instagram and TikTok
 * are always one segment.
 */
export function normalizeHandle(platform: SocialPlatform, raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (/^(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)*(?:instagram|tiktok|facebook|fb)\.com(?:\/|$))/i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      const id = u.searchParams.get("id");
      s = platform === "facebook" && /profile\.php$/i.test(u.pathname) && id ? `profile.php?id=${id}` : u.pathname;
    } catch {
      s = s.replace(/^[^/]*\//, "/");
    }
  }
  if (!/^profile\.php\?id=/i.test(s)) s = s.replace(/[?#].*$/, "");
  s = s.replace(/^\/+|\/+$/g, "");
  if (platform === "facebook") s = s.replace(FACEBOOK_VIEWS, "");
  else s = s.split("/")[0] ?? "";
  return s.replace(/^@/, "").toLowerCase();
}
