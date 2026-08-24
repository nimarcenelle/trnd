import { CATEGORIES } from "@/lib/db/types";

/**
 * Website import: one polite fetch of the business's own site (owner-initiated,
 * 8s timeout, identified UA), then best-effort extraction of name, category,
 * location, and priced offerings. The deterministic extractor below always
 * runs; Gemini refines it when configured. Everything is a PREFILL the owner
 * confirms in onboarding — never silently trusted.
 */

export interface ImportedService {
  name: string;
  price: string; // dollars, as typed on the site, e.g. "7" or "24.50"
}

export interface SiteImport {
  name?: string;
  category?: (typeof CATEGORIES)[number];
  city?: string;
  region?: string;
  services: ImportedService[];
  voiceHint?: string;
  /** "$" | "$$" | "$$$", inferred from real prices on the site. */
  priceBand?: string;
}

export interface SitePage {
  url: string;
  html: string;
}

export interface SiteCorpus {
  pages: SitePage[];
  /** Plain text of every fetched page, labeled by path, capped. */
  text: string;
}

// Browser-like UA (with product identity appended) — WAFs commonly 403 bare
// bot UAs, and this is a single owner-initiated read of their own site, the
// same class of request as a link unfurler.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 trnd-onboarding/0.1";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 400_000;

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchOnce(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } finally {
    clearTimeout(t);
  }
}

/** One fetch, then a single www./bare-host variant retry — nothing noisier. */
export async function fetchSiteHtml(url: string): Promise<string> {
  try {
    return await fetchOnce(url);
  } catch (first) {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    try {
      return await fetchOnce(u.toString());
    } catch {
      throw first;
    }
  }
}

/* ------------------------------ site crawl ------------------------------ */

// Pages worth reading beyond the homepage, in priority order. Menus and
// pricing first — that's where offerings live; about/story pages feed the
// voice and positioning read.
const LINK_PRIORITY = [
  /menu/i,
  /pric|rate|package|bundle/i,
  /service|treatment|class|membership|offering/i,
  /shop|store|product|collection/i,
  /about|story|team|our-/i,
  /book|schedule|catering|event/i,
];
const MAX_SUBPAGES = 4;
const MAX_CORPUS_CHARS = 24_000;

/**
 * Internal links that look like menu/services/pricing/about pages, best
 * first. Same host only; anchors, files, mailto/tel are skipped.
 */
export function discoverInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const scored: { url: string; score: number }[] = [];
  const seen = new Set<string>([base.href]);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].trim();
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|docx?)$/i.test(u.pathname)) continue;
    u.hash = "";
    if (seen.has(u.href)) continue;
    const anchorText = m[2].replace(/<[^>]+>/g, " ");
    const haystack = `${u.pathname} ${anchorText}`;
    const score = LINK_PRIORITY.findIndex((re) => re.test(haystack));
    if (score === -1) continue;
    seen.add(u.href);
    scored.push({ url: u.href, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SUBPAGES)
    .map((s) => s.url);
}

/**
 * Homepage plus up to four relevant subpages (menu, pricing, services,
 * about), fetched in parallel. Subpage failures are dropped silently — the
 * homepage alone is still a useful corpus.
 */
export async function fetchSiteCorpus(url: string): Promise<SiteCorpus> {
  const homeHtml = await fetchSiteHtml(url);
  const links = discoverInternalLinks(homeHtml, url);
  const settled = await Promise.allSettled(links.map((l) => fetchOnce(l)));
  const pages: SitePage[] = [{ url, html: homeHtml }];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") pages.push({ url: links[i], html: r.value });
  });

  let text = "";
  for (const p of pages) {
    if (text.length >= MAX_CORPUS_CHARS) break;
    const path = new URL(p.url).pathname || "/";
    const stripped = stripHtml(p.html).text;
    text += `\n\n=== PAGE ${path} ===\n${stripped.slice(0, MAX_CORPUS_CHARS - text.length)}`;
  }
  return { pages, text: text.trim() };
}

/* ------------------------------ extraction ------------------------------ */

const STATE_RE =
  "A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]";

const CATEGORY_KEYWORDS: [RegExp, (typeof CATEGORIES)[number]][] = [
  [/(coffee|cafe|café|espresso|brunch|restaurant|menu|bakery|bistro|eatery|pizza|taco)/i, "Restaurants & cafés"],
  [/(botox|filler|facial|medspa|med spa|aesthetic|skincare|salon|lash|brow|waxing)/i, "Health & beauty"],
  [/(plumb|hvac|roof|electric|landscap|handyman|cleaning service|pest)/i, "Home services"],
  [/(gym|fitness|yoga|pilates|crossfit|training|workout)/i, "Fitness studios"],
  [/(dental|dentist|orthodont|invisalign|veneer|wellness clinic|chiropract)/i, "Dental & wellness"],
  [/(auto|tire|oil change|detailing|mechanic|collision|car wash)/i, "Auto services"],
  [/(boutique|shop|store|apparel|jewelry|gift|vintage)/i, "Retail & boutiques"],
];

function stripHtml(html: string): { text: string; lines: string[] } {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = noScripts.replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr)[^>]*>/gi, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"');
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  return { text: lines.join("\n"), lines };
}

interface JsonLdBiz {
  name?: string;
  address?: { addressLocality?: string; addressRegion?: string };
  description?: string;
  "@type"?: string | string[];
}

function parseJsonLd(html: string): JsonLdBiz | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      const nodes = Array.isArray(parsed)
        ? parsed
        : [parsed, ...((parsed as { "@graph"?: unknown[] })["@graph"] ?? [])];
      for (const node of nodes as JsonLdBiz[]) {
        const type = Array.isArray(node["@type"]) ? node["@type"].join(",") : (node["@type"] ?? "");
        if (/LocalBusiness|Restaurant|CafeOrCoffeeShop|Store|HealthAndBeautyBusiness|Dentist|AutoRepair|ExerciseGym/i.test(String(type))) {
          return node;
        }
      }
    } catch {
      /* malformed JSON-LD — skip */
    }
  }
  return null;
}

/** Lines that look like "<offering> … $<price>" become service candidates. */
function extractPricedItems(lines: string[]): ImportedService[] {
  const out: ImportedService[] = [];
  const seen = new Set<string>();
  const re = /^(.{3,48}?)[\s.·…—–-]*\$\s?(\d{1,4}(?:\.\d{2})?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const name = m[1].replace(/[.·…—–-]+$/, "").trim();
    if (name.length < 3 || /total|subtotal|shipping|delivery fee|tax|minimum|gift card/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), price: m[2] });
    if (out.length >= 12) break;
  }
  return out;
}

export function extractFromHtml(html: string): SiteImport {
  const { text, lines } = stripHtml(html);
  const result: SiteImport = { services: extractPricedItems(lines) };

  const ld = parseJsonLd(html);
  if (ld?.name) result.name = ld.name;
  if (ld?.address?.addressLocality) result.city = ld.address.addressLocality;
  if (ld?.address?.addressRegion) result.region = ld.address.addressRegion;
  if (ld?.description) result.voiceHint = ld.description.slice(0, 200);

  if (!result.name) {
    const title = html.match(/<title[^>]*>([\s\S]{1,120}?)<\/title>/i)?.[1];
    if (title) {
      result.name = title.split(/\s*[|–—·:]\s*/)[0].replace(/\s+/g, " ").trim().slice(0, 60);
    }
  }
  if (!result.city) {
    const m = text.match(new RegExp(`([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?),\\s*(${STATE_RE})\\b`));
    if (m) {
      result.city = m[1];
      result.region = m[2];
    }
  }
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) {
      result.category = cat;
      break;
    }
  }
  if (!result.voiceHint) {
    const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,200})["']/i)?.[1];
    if (desc) result.voiceHint = desc;
  }
  return result;
}

/** Plain text of one HTML page — for feeding page copy to the analysis. */
export function htmlToText(html: string): string {
  return stripHtml(html).text;
}

// Median-price thresholds per category for a $ / $$ / $$$ read. Rough on
// purpose — this is a prefill the owner confirms, never a silent decision.
const PRICE_BAND_THRESHOLDS: Record<string, [number, number]> = {
  "Restaurants & cafés": [12, 25],
  "Home services": [150, 400],
  "Health & beauty": [75, 250],
  "Fitness studios": [25, 60],
  "Retail & boutiques": [30, 100],
  "Auto services": [60, 250],
  "Dental & wellness": [100, 350],
};

export function inferPriceBand(
  services: ImportedService[],
  category?: string,
): string | undefined {
  const thresholds = category ? PRICE_BAND_THRESHOLDS[category] : undefined;
  if (!thresholds) return undefined;
  const prices = services
    .map((s) => parseFloat(s.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return undefined;
  const median = prices[Math.floor(prices.length / 2)];
  if (median < thresholds[0]) return "$";
  if (median < thresholds[1]) return "$$";
  return "$$$";
}

/**
 * Extraction over the whole crawl: identity and location come from the
 * homepage (JSON-LD, title, meta), priced offerings are pooled across every
 * page (menu and pricing pages usually carry them), and the price band is
 * inferred from the pooled prices.
 */
export function extractFromPages(pages: SitePage[]): SiteImport {
  const result = extractFromHtml(pages[0].html);
  const seen = new Set(result.services.map((s) => s.name.toLowerCase()));
  for (const page of pages.slice(1)) {
    const sub = extractFromHtml(page.html);
    for (const svc of sub.services) {
      const key = svc.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.services.push(svc);
      if (result.services.length >= 15) break;
    }
    // A subpage can name the category (e.g. /menu) when the homepage doesn't.
    if (!result.category && sub.category) result.category = sub.category;
    if (result.services.length >= 15) break;
  }
  result.priceBand = inferPriceBand(result.services, result.category);
  return result;
}
