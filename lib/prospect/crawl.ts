import { decodeEntities, fetchSiteHtml, htmlToText, looksBlocked } from "@/lib/import/website";

/**
 * Prospect site read: homepage plus up to two contact-ish pages, then pure
 * extraction of contact emails, the site platform, and ad-pixel presence.
 * Ad-pixel absence is TRND's qualifying signal — a local business with a real
 * site and no pixel is exactly who the product is for.
 */

export interface SiteRead {
  emails: string[];
  platform: string;
  adPixels: string[];
}

/* ------------------------------ extraction ------------------------------ */

// Platform fingerprints, most-specific first — WordPress markers appear in
// many themes, so it goes last among the CMSes.
const PLATFORM_MARKS: [RegExp, string][] = [
  [/cdn\.shopify\.com|shopify\.theme|myshopify\.com/i, "Shopify"],
  [/static\.parastorage\.com|wixstatic\.com|wix\.com\/website/i, "Wix"],
  [/squarespace\.com|static1\.squarespace|sqsp\.net/i, "Squarespace"],
  [/webflow\.(com|io)|website-files\.com/i, "Webflow"],
  [/weebly\.com|weeblycloud/i, "Weebly"],
  [/wsimg\.com|godaddy\.com\/websites|secureserver\.net/i, "GoDaddy"],
  [/toasttab\.com/i, "Toast"],
  [/wp-content|wp-includes|wp-json/i, "WordPress"],
];

export function detectPlatform(html: string): string {
  for (const [re, name] of PLATFORM_MARKS) {
    if (re.test(html)) return name;
  }
  return "Custom";
}

// Hard evidence of a live ad pixel — GTM alone is ambiguous and doesn't count.
const PIXEL_MARKS: [RegExp, string][] = [
  [/connect\.facebook\.net|fbq\s*\(\s*['"]init/i, "meta"],
  [/googleads\.g\.doubleclick\.net|\bAW-\d{9,11}\b/i, "google"],
  [/analytics\.tiktok\.com|ttq\.load/i, "tiktok"],
  [/s\.pinimg\.com\/ct\/|pintrk\s*\(/i, "pinterest"],
];

export function detectAdPixels(html: string): string[] {
  const found: string[] = [];
  for (const [re, name] of PIXEL_MARKS) {
    if (re.test(html)) found.push(name);
  }
  return found;
}

// Addresses that are never a human inbox, plus platform-noise domains that
// show up in page source but belong to nobody at the business.
const JUNK_LOCAL = /^(no-?reply|donotreply|mailer-daemon|postmaster|abuse|privacy|dmca|unsubscribe|example|user|email|name|your-?email|test)$/i;
const JUNK_DOMAIN =
  /sentry|wixpress|example\.|sentry-next|godaddy\.com$|squarespace\.com$|shopify\.com$|placeholder|domain\.com$|email\.com$|yourdomain|company\.com$|2x\.png$|\.(png|jpe?g|gif|webp|svg|css|js)$|restaurant\.com$|singleplatform|allmenus|menufy|doordash|grubhub|ubereats|yelp\.com$/i;

const EMAIL_RE = /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,10}/g;

/** Every plausible human-contact email on the page, mailto links first. */
export function extractEmails(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    // Real hrefs carry typos ("mailto:mailto:x@y.com") and stray whitespace.
    const email = decodeEntities(raw)
      .replace(/^[\s:]*(mailto:)+/gi, "")
      .trim()
      .replace(/\.$/, "")
      .toLowerCase();
    if (!new RegExp(`^${EMAIL_RE.source}$`).test(email)) return;
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (JUNK_LOCAL.test(local) || JUNK_DOMAIN.test(domain)) return;
    if (email.length > 60 || seen.has(email)) return;
    seen.add(email);
    out.push(email);
  };
  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) push(m[1]);
  for (const m of htmlToText(html).matchAll(EMAIL_RE)) push(m[0]);
  return out.slice(0, 10);
}

const GENERIC_INBOX = /^(hello|hi|info|contact|hola|howdy|bookings?|orders?|team|shop|office|sales|admin|support|events?|catering|inquiries|enquiries)$/i;

/**
 * Pick the address most likely to reach the owner: same-domain generic
 * inboxes (hello@, info@) first, then any same-domain address, then the rest
 * in page order.
 */
export function pickBestEmail(emails: string[], siteHost: string | null): string | null {
  if (emails.length === 0) return null;
  const bare = (h: string) => h.replace(/^www\./i, "").toLowerCase();
  const host = siteHost ? bare(siteHost) : null;
  const score = (email: string): number => {
    const [local, domain] = email.split("@");
    const onDomain = host !== null && (bare(domain) === host || host.endsWith(`.${bare(domain)}`));
    if (onDomain && GENERIC_INBOX.test(local)) return 0;
    if (onDomain) return 1;
    if (GENERIC_INBOX.test(local)) return 2;
    return 3;
  };
  return [...emails].sort((a, b) => score(a) - score(b))[0];
}

/** The table's one-liner: what the pixel read says about their ad presence. */
export function describeSignal(read: SiteRead | null, hasSite: boolean): string {
  if (!hasSite) return "No website — listings only";
  if (!read) return "Site unreadable";
  if (read.adPixels.length === 0) return "No ad pixel detected";
  const names: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", pinterest: "Pinterest" };
  return `${read.adPixels.map((p) => names[p] ?? p).join(" + ")} pixel live`;
}

/* -------------------------------- fetch --------------------------------- */

const CONTACT_LINK = /contact|about|connect|reach|visit|info/i;
const MAX_CONTACT_PAGES = 2;

/** Same-site links that look like contact/about pages. */
export function findContactLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = decodeEntities(m[1].trim());
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    const bare = (h: string) => h.replace(/^www\./i, "");
    if (bare(u.hostname) !== bare(base.hostname) || !/^https?:$/.test(u.protocol)) continue;
    if (!CONTACT_LINK.test(u.pathname)) continue;
    const key = (u.origin + u.pathname).replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    u.hash = "";
    out.push(u.href);
    if (out.length >= MAX_CONTACT_PAGES) break;
  }
  return out;
}

/**
 * One polite read of a prospect's public site: homepage, then contact/about
 * pages only if the homepage surfaced no email. Never renders headlessly —
 * this runs across many sites per batch, so it stays cheap and shallow.
 */
export async function readProspectSite(website: string): Promise<SiteRead | null> {
  let home: string;
  try {
    home = await fetchSiteHtml(website);
  } catch {
    return null;
  }
  if (looksBlocked(home)) return null;
  const emails = extractEmails(home);
  const read: SiteRead = {
    emails,
    platform: detectPlatform(home),
    adPixels: detectAdPixels(home),
  };
  if (emails.length > 0) return read;
  for (const link of findContactLinks(home, website)) {
    try {
      const sub = await fetchSiteHtml(link);
      if (looksBlocked(sub)) continue;
      for (const e of extractEmails(sub)) {
        if (!read.emails.includes(e)) read.emails.push(e);
      }
      if (read.emails.length > 0) break;
    } catch {
      /* contact page failed — homepage read stands */
    }
  }
  return read;
}
