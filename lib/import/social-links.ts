import type { SocialHandles, SocialPlatform } from "@/lib/db/types";

/**
 * The accounts a site links to. Almost every small business puts Instagram,
 * TikTok and Facebook icons in its footer, so the crawl that already read
 * their pages holds their handles for free. That is the brand half of the
 * social read at onboarding, and the rival half when a competitor's site is
 * read. Reading the links, never the platforms: no request leaves here.
 */

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "facebook"];

/** Same rule the onboarding action enforces on the hidden field. */
export const HANDLE_RE = /^[a-z0-9._-]{1,40}$/;

// Path segments that name a post, a share dialog, a tracking pixel or the
// platform's own chrome, never an account. A footer rarely links these, but
// share buttons, embedded posts and the Meta pixel's <noscript> image
// ("facebook.com/tr?id=…") sit on every page and would otherwise outvote the
// real handle.
const NON_PROFILE = new Set([
  "p", "reel", "reels", "explore", "stories", "tag", "tags", "hashtag", "share", "share.php", "sharer",
  "sharer.php", "dialog", "intent", "login", "login.php", "accounts", "video", "videos", "photo", "photos",
  "photo.php", "events", "groups", "plugins", "policies", "policy", "help", "profile.php", "tr", "watch",
  "pages", "people", "marketplace", "gaming", "business", "ads", "legal", "privacy", "terms", "about",
  "developer", "developers", "direct", "embed", "embed.js", "search", "discover", "music", "l.php",
  "home.php", "story.php", "permalink.php", "notes", "media", "places", "fundraisers", "messages", "web",
]);

/** The platforms' own accounts: an "as seen on Instagram" badge is not the business. */
const SELF_ACCOUNTS: Record<SocialPlatform, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  facebook: "facebook",
};

// The host must start the URL or follow a scheme or quote, so
// "developers.facebook.com" and "notinstagram.com" never match.
const SOCIAL_URL =
  /(?<![\w.-])(?:https?:)?(?:\/\/)?(?:(?:www|m|web|mobile)\.)?(instagram\.com|tiktok\.com|facebook\.com|fb\.com)\/([^\s"'<>()\\]*)/gi;

function platformOf(host: string): SocialPlatform {
  const h = host.toLowerCase();
  if (h.startsWith("instagram")) return "instagram";
  if (h.startsWith("tiktok")) return "tiktok";
  return "facebook";
}

/** One linked path to a handle, or null when it isn't a profile link. */
function handleFrom(platform: SocialPlatform, rawPath: string): string | null {
  let path = rawPath.split(/[?#&]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* a malformed escape; read the path as written */
  }
  const segments = path.split("/").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((s) => NON_PROFILE.has(s))) return null;
  let first = segments[0];
  if (platform === "tiktok") {
    // A TikTok account lives at /@handle; anything else is chrome.
    if (!first.startsWith("@")) return null;
    first = first.slice(1);
  } else {
    first = first.replace(/^@/, "");
  }
  if (!HANDLE_RE.test(first)) return null;
  if (/\.(php|js|html?)$/.test(first)) return null;
  // "facebook.com/2008/fbml" is the XML namespace old themes still declare.
  if (/^\d{1,5}$/.test(first)) return null;
  if (first === SELF_ACCOUNTS[platform]) return null;
  return first;
}

type Tally = Record<SocialPlatform, Map<string, number>>;

function tally(html: string, counts: Tally): void {
  // Themes embed settings as JSON with escaped slashes ("https:\/\/instagram.com\/x").
  const text = html.replace(/\\\//g, "/");
  for (const m of text.matchAll(SOCIAL_URL)) {
    const platform = platformOf(m[1]);
    const handle = handleFrom(platform, m[2]);
    if (!handle) continue;
    counts[platform].set(handle, (counts[platform].get(handle) ?? 0) + 1);
  }
}

function winners(counts: Tally): SocialHandles {
  const out: SocialHandles = {};
  for (const platform of SOCIAL_PLATFORMS) {
    let best: [string, number] | null = null;
    // Map keeps first-seen order, so a tie goes to the link the site showed
    // first (the homepage, when pooling).
    for (const entry of counts[platform]) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (best) out[platform] = best[0];
  }
  return out;
}

const emptyTally = (): Tally => ({ instagram: new Map(), tiktok: new Map(), facebook: new Map() });

/**
 * Handles one page links to. When it links several on a platform (the
 * owner's account and a featured partner, say), the one linked most often
 * is theirs: the header and footer both carry it.
 */
export function extractSocialHandles(html: string): SocialHandles {
  const counts = emptyTally();
  tally(html, counts);
  return winners(counts);
}

/** Handles across a whole crawl, counted together so every page votes. */
export function poolSocialHandles(pages: { url: string; html: string }[]): SocialHandles {
  const counts = emptyTally();
  for (const page of pages) tally(page.html, counts);
  return winners(counts);
}

/** The canonical profile URL for a handle. */
export function handleUrl(platform: SocialPlatform, handle: string): string {
  const h = handle.replace(/^@/, "");
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  return `https://www.facebook.com/${h}`;
}

/**
 * Handles that arrived from outside (a hidden form field) cut down to what
 * we store: only the three platforms, only well-formed handles. Anything
 * else is dropped, not rejected, since handles never block onboarding.
 */
export function cleanSocialHandles(value: unknown): SocialHandles {
  const out: SocialHandles = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = (value as Record<string, unknown>)[platform];
    if (typeof raw !== "string") continue;
    const handle = raw.trim().replace(/^@/, "").toLowerCase();
    if (HANDLE_RE.test(handle)) out[platform] = handle;
  }
  return out;
}
