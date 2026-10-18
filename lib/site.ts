/**
 * A brand's website as plain text, enough for the model to say what the brand
 * sells and who it competes with. A plain fetch first; a JavaScript-rendered
 * storefront that comes back nearly empty is read again through the free
 * r.jina.ai reader, which renders it.
 */

import { fetchRetry } from "@/lib/retry";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MAX_CHARS = 12_000;

export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return [title.trim(), description.trim(), body].filter(Boolean).join("\n");
}

/** A GET that answers null on any failure. */
export async function get(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetchRetry(url, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", ...headers },
      redirect: "follow",
      timeoutMs: 20_000,
      cache: "no-store",
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export interface Socials {
  instagram: string | null;
  tiktok: string | null;
  /** A Facebook Page handle ("brand") or numeric id, from a facebook.com link. */
  facebook: string | null;
}

const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "about", "developer", "legal", "direct"]);

/** The brand's own Instagram and TikTok handles, from the links on its site (usually the footer). */
export function extractSocials(html: string): Socials {
  let instagram: string | null = null;
  for (const m of html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g)) {
    const h = m[1].replace(/\.+$/, "");
    if (!IG_RESERVED.has(h.toLowerCase())) {
      instagram = h;
      break;
    }
  }
  const tiktok = html.match(/tiktok\.com\/@([A-Za-z0-9._]{2,30})/)?.[1]?.replace(/\.+$/, "") ?? null;
  return { instagram, tiktok, facebook: facebookRef(html) };
}

const FB_RESERVED = new Set([
  "sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "home.php", "groups", "events",
  "watch", "help", "policies", "privacy", "legal", "business", "ads", "marketplace", "gaming", "hashtag", "l.php", "photo.php",
  "photo", "photos", "story.php", "permalink.php", "video.php", "people", "pages", "pg",
]);

/** The first facebook.com Page link in some HTML or text: its handle, or its numeric id. */
export function facebookRef(html: string): string | null {
  for (const m of html.matchAll(/(?:facebook|fb)\.com\/(profile\.php\?id=(\d+)|people\/[^/"'\s]+\/(\d+)|pages\/[^/"'\s]+\/(\d+)|pg\/([A-Za-z0-9.\-]{2,80})|([A-Za-z0-9.\-]{2,80}))/gi)) {
    const id = m[2] ?? m[3] ?? m[4];
    if (id) return id;
    const handle = (m[5] ?? m[6] ?? "").replace(/\.+$/, "");
    // xmlns="http://www.facebook.com/2008/fbml" is not a Page.
    if (handle && !/^\d{1,4}$/.test(handle) && !FB_RESERVED.has(handle.toLowerCase())) return handle;
  }
  return null;
}

/** The site as text, plus the social handles it links to. */
export async function readSitePage(url: string): Promise<{ text: string; socials: Socials }> {
  const html = await get(url);
  let text = html ? htmlToText(html) : "";
  let socials: Socials = html ? extractSocials(html) : { instagram: null, tiktok: null, facebook: null };
  if (text.length < 600 || (!socials.instagram && !socials.tiktok && !socials.facebook)) {
    const rendered = await get(`https://r.jina.ai/${url}`, { accept: "text/plain" });
    if (rendered) {
      if (rendered.length > text.length && text.length < 600) text = rendered.replace(/\s+/g, " ");
      const more = extractSocials(rendered);
      socials = {
        instagram: socials.instagram ?? more.instagram,
        tiktok: socials.tiktok ?? more.tiktok,
        facebook: socials.facebook ?? more.facebook,
      };
    }
  }
  if (!text) throw new Error(`Could not read ${url}`);
  return { text: text.slice(0, MAX_CHARS), socials };
}

export async function readSite(url: string): Promise<string> {
  return (await readSitePage(url)).text;
}
