import { CATEGORIES } from "@/lib/db/types";
import { verticalKey } from "@/lib/signals/vertical";

import type { Renderer } from "./render";

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
  category?: string;
  city?: string;
  region?: string;
  services: ImportedService[];
  voiceHint?: string;
  /** "$" | "$$" | "$$$", inferred from real prices on the site. */
  priceBand?: string;
  /** Real photos from their own site — creative previews use these instead
   * of placeholders. */
  photos?: string[];
  /** Where the menu actually lives when it's on an ordering platform the
   * crawl can't read (Toast, Square, Clover…) — the wizard names it and
   * asks for the menu directly instead of pretending the site had no prices. */
  menuHost?: { name: string; url: string };
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
  /location|contact|visit|find-us/i,
  /about|story|team|our-/i,
  /book|schedule|catering|event/i,
];
const MAX_SUBPAGES = 4;

// Ordering platforms that hold a business's real menu and prices off-site.
// Most sit behind bot challenges, so the crawl can't read them from
// serverless — but knowing the menu is there changes what we tell the owner.
const MENU_HOSTS: { re: RegExp; name: string }[] = [
  { re: /(^|\.)toasttab\.com$/i, name: "Toast" },
  { re: /(^|\.)(squareup\.com|square\.site)$/i, name: "Square" },
  { re: /(^|\.)clover\.com$/i, name: "Clover" },
  { re: /(^|\.)chownow\.com$/i, name: "ChowNow" },
  { re: /(^|\.)popmenu\.com$/i, name: "Popmenu" },
  { re: /(^|\.)getbento\.com$/i, name: "BentoBox" },
  { re: /(^|\.)olo\.com$/i, name: "Olo" },
  { re: /(^|\.)doordash\.com$/i, name: "DoorDash" },
  { re: /(^|\.)ubereats\.com$/i, name: "Uber Eats" },
  { re: /(^|\.)grubhub\.com$/i, name: "Grubhub" },
  { re: /(^|\.)slicelife\.com$/i, name: "Slice" },
  { re: /(^|\.)menufy\.com$/i, name: "Menufy" },
  { re: /(^|\.)untappd\.com$/i, name: "Untappd" },
];

/**
 * The first link to an ordering platform whose anchor or path says "menu"
 * or "order" — "Online Menu → toasttab.com/caffedriade". Anchor text alone
 * is enough on a known host: that's where owners keep the priced menu.
 */
export function discoverOffsiteMenu(html: string, baseUrl: string): { name: string; url: string } | null {
  const base = new URL(baseUrl);
  // Nav links wrap their label in layers of spans (theme "menu-fx"
  // markup), so the anchor body is allowed to run long.
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,800}?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(decodeEntities(m[1].trim()), base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || sameSite(u.hostname, base.hostname)) continue;
    const host = MENU_HOSTS.find((h) => h.re.test(u.hostname));
    if (!host) continue;
    const anchor = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // A labeled menu/order link, or an image-only button to the platform —
    // on a known host either is the menu.
    const labeled = /menu|order|shop/i.test(`${anchor} ${u.pathname}`) || /menu|order/i.test(u.hostname);
    if (!labeled && anchor.length > 0) continue;
    u.hash = "";
    return { name: host.name, url: u.href };
  }
  return null;
}
const MAX_CORPUS_CHARS = 24_000;
// Below this much visible text a page is a JS husk — worth a headless render.
const MIN_PAGE_TEXT = 500;
const MAX_RENDERED_PAGES = 3;

/** Bot-protection interstitials — extracting from these produces garbage
 * prefills ("Attention Required!" as the business name). */
export function looksBlocked(html: string): boolean {
  const head = stripHtml(html.slice(0, 4000)).text;
  return /attention required|just a moment|access denied|verify you are (a )?human|are you a robot|enable javascript and cookies|cf-browser-verification|captcha/i.test(
    head,
  );
}

/** Same site modulo the www. prefix — nav links routinely cross that line. */
function sameSite(a: string, b: string): boolean {
  const bare = (h: string) => h.replace(/^www\./i, "");
  return bare(a) === bare(b);
}

/**
 * Internal links that look like menu/services/pricing/about pages, best
 * first. Same site only; anchors, files, mailto/tel are skipped.
 */
export function discoverInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const scored: { url: string; score: number }[] = [];
  const seen = new Set<string>([(base.origin + base.pathname).replace(/\/+$/, "")]);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = decodeEntities(m[1].trim());
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!sameSite(u.hostname, base.hostname) || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|docx?)$/i.test(u.pathname)) continue;
    u.hash = "";
    // Dedupe on origin+path — tracking params and trailing slashes vary
    // across copies of the same nav link.
    const key = (u.origin + u.pathname).replace(/\/+$/, "");
    if (seen.has(key)) continue;
    const anchorText = m[2].replace(/<[^>]+>/g, " ");
    const haystack = `${u.pathname} ${anchorText}`;
    const score = LINK_PRIORITY.findIndex((re) => re.test(haystack));
    if (score === -1) continue;
    seen.add(key);
    scored.push({ url: u.href, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SUBPAGES)
    .map((s) => s.url);
}

/** One NDJSON line per event on /api/import — the wizard narrates these. */
export type ImportEvent =
  | { type: "status"; label: string }
  | { type: "partial"; data: SiteImport }
  | { type: "final"; data: SiteImport; siteText: string }
  | { type: "error"; reason: string };

/** Progress events the crawl emits, so a caller can stream live status. */
export type CorpusProgress =
  | { kind: "rendering"; path: string }
  | { kind: "links"; paths: string[] }
  | { kind: "page"; path: string };

const pathOf = (u: string) => new URL(u).pathname || "/";

/**
 * Homepage plus up to four relevant subpages (menu, pricing, services,
 * locations, about), fetched in parallel. When the plain fetch is blocked
 * (WAF 403) or returns a JS husk with no visible text, a headless-browser
 * render takes over where Playwright is installed (see lib/import/render.ts).
 * Subpage failures are dropped silently — the homepage alone is still a
 * useful corpus.
 */
export async function fetchSiteCorpus(
  url: string,
  onProgress?: (event: CorpusProgress) => void,
): Promise<SiteCorpus> {
  let renderer: Renderer | null = null;
  let rendersLeft = MAX_RENDERED_PAGES;
  const renderPage = async (pageUrl: string): Promise<string | null> => {
    if (rendersLeft <= 0) return null;
    if (renderer === null) {
      const { getRenderer } = await import("./render");
      renderer = await getRenderer();
      if (!renderer) rendersLeft = 0;
    }
    if (!renderer) return null;
    rendersLeft--;
    onProgress?.({ kind: "rendering", path: pathOf(pageUrl) });
    return renderer.render(pageUrl);
  };

  // Fetch first; if the result is missing, a JS husk, or a bot-protection
  // interstitial, try a headless render. Returns usable HTML or an error.
  const loadPage = async (pageUrl: string): Promise<{ html: string | null; error: unknown }> => {
    let html: string | null = null;
    let error: unknown;
    try {
      html = await fetchSiteHtml(pageUrl);
    } catch (err) {
      error = err;
    }
    if (!html || stripHtml(html).text.length < MIN_PAGE_TEXT || looksBlocked(html)) {
      const rendered = await renderPage(pageUrl);
      // Keep the render only if it beat the fetch (a challenge page can
      // appear in both).
      if (rendered && !looksBlocked(rendered)) {
        html = rendered;
      } else if (rendered) {
        html = null;
        error = new Error("the site's bot protection blocked the read");
      }
    }
    if (html && looksBlocked(html)) {
      html = null;
      error = new Error("the site's bot protection blocked the read");
    }
    return { html, error: error ?? new Error("empty page") };
  };

  try {
    const givenLoad = await loadPage(url);
    if (!givenLoad.html) throw givenLoad.error;
    onProgress?.({ kind: "page", path: pathOf(url) });

    // A pasted deep link (a menu or booking page) is often where the prices
    // are — keep it, and crawl the site root alongside it for identity.
    const pages: SitePage[] = [];
    const given = new URL(url);
    if (given.pathname.replace(/\/+$/, "") !== "") {
      const rootUrl = `${given.origin}/`;
      const rootLoad = await loadPage(rootUrl);
      if (rootLoad.html) {
        pages.push({ url: rootUrl, html: rootLoad.html });
        onProgress?.({ kind: "page", path: "/" });
      }
    }
    pages.push({ url, html: givenLoad.html });

    const pathKey = (u: string) => (new URL(u).origin + new URL(u).pathname).replace(/\/+$/, "");
    const linkSeen = new Set(pages.map((p) => pathKey(p.url)));
    const links: string[] = [];
    for (const l of pages.flatMap((p) => discoverInternalLinks(p.html, p.url))) {
      if (links.length >= MAX_SUBPAGES) break;
      const key = pathKey(l);
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      links.push(l);
    }
    if (links.length > 0) onProgress?.({ kind: "links", paths: links.map(pathOf) });
    const settled = await Promise.allSettled(links.map((l) => fetchOnce(l)));
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      let html = r.status === "fulfilled" ? r.value : null;
      if (!html || stripHtml(html).text.length < MIN_PAGE_TEXT) {
        html = (await renderPage(links[i])) ?? html;
      }
      if (html && !looksBlocked(html)) {
        pages.push({ url: links[i], html });
        onProgress?.({ kind: "page", path: pathOf(links[i]) });
      }
    }

    let text = "";
    for (const p of pages) {
      if (text.length >= MAX_CORPUS_CHARS) break;
      const path = new URL(p.url).pathname || "/";
      const stripped = stripHtml(p.html).text;
      text += `\n\n=== PAGE ${path} ===\n${stripped.slice(0, MAX_CORPUS_CHARS - text.length)}`;
    }
    return { pages, text: text.trim() };
  } finally {
    await (renderer as Renderer | null)?.close();
  }
}

/**
 * One plain read of an off-site menu page. Most ordering platforms answer
 * with a bot challenge or a JS husk — then this returns nothing and the
 * wizard asks the owner for the menu instead. When a platform does serve
 * HTML with prices, they're pooled like any other page.
 */
export async function readOffsiteMenu(url: string): Promise<ImportedService[]> {
  try {
    const html = await fetchOnce(url);
    if (looksBlocked(html) || stripHtml(html).text.length < MIN_PAGE_TEXT) return [];
    return extractFromHtml(html).services.filter((s) => s.price);
  } catch {
    return [];
  }
}

/* ------------------------------ extraction ------------------------------ */

const STATE_RE =
  "A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]";

// Scored, not first-match: every site's nav says "menu", so a single generic
// hit must not outvote a page full of "sauna" or "dental".
const CATEGORY_KEYWORDS: [RegExp, (typeof CATEGORIES)[number]][] = [
  [/(coffee|cafe|café|espresso|brunch|restaurant|menu|bakery|bistro|eatery|pizza|taco)/i, "Restaurants & cafés"],
  [/(botox|filler|facial|medspa|med spa|aesthetic|skincare|salon|barber|lash|brow|waxing|sauna|cold plunge|contrast therapy|cryotherapy|float tank)/i, "Health & beauty"],
  [/(plumb|hvac|roof|electric|landscap|handyman|cleaning service|pest)/i, "Home services"],
  [/(gym|fitness|yoga|pilates|crossfit|training|workout)/i, "Fitness studios"],
  [/(dental|dentist|orthodont|invisalign|veneer|wellness clinic|chiropract)/i, "Dental & wellness"],
  [/(auto|tire|oil change|detailing|mechanic|collision|car wash)/i, "Auto services"],
  [/(boutique|shop|store|apparel|jewelry|gift|vintage)/i, "Retail & boutiques"],
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  ndash: "–",
  mdash: "—",
  hellip: "…",
  eacute: "é",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** Real sites double-encode ("Tupelo Honey Kitchen &amp; Bar" inside JSON-LD). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripHtml(html: string): { text: string; lines: string[] } {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = noScripts.replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr)[^>]*>/gi, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  return { text: lines.join("\n"), lines };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type LdNode = Record<string, any>;

function nodeType(node: LdNode): string {
  const t = node["@type"];
  return Array.isArray(t) ? t.join(",") : String(t ?? "");
}

/** Every JSON-LD node on the page, flattened through arrays and @graph. */
function collectJsonLdNodes(html: string): LdNode[] {
  const nodes: LdNode[] = [];
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) {
          queue.push(...item);
          continue;
        }
        const node = item as LdNode;
        nodes.push(node);
        if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      }
    } catch {
      /* malformed JSON-LD — skip */
    }
  }
  return nodes;
}

// Any organization-shaped identity node — real sites use dozens of
// LocalBusiness subtypes (FoodEstablishment, BeautySalon, Plumber, …) that a
// short whitelist misses. A postal address is an equally good signal.
const IDENTITY_TYPE =
  /Business|Restaurant|Cafe|Coffee|Bar\b|Bakery|Food|Store|Shop|Boutique|Dentist|Dental|Auto|Gym|Fitness|Salon|Spa|Beauty|Clinic|Physician|Plumber|Electrician|Roofing|HomeAndConstruction|Organization/i;

function findIdentityNode(nodes: LdNode[]): LdNode | null {
  const candidates = nodes.filter((n) => IDENTITY_TYPE.test(nodeType(n)) || n.address);
  // Prefer the node that actually carries an address, then one with a name.
  return (
    candidates.find((n) => n.address && n.name) ??
    candidates.find((n) => n.address) ??
    candidates.find((n) => n.name) ??
    null
  );
}

function addressParts(node: LdNode): { city?: string; region?: string } {
  const addr = node.address;
  if (!addr) return {};
  if (typeof addr === "string") {
    const m = addr.match(new RegExp(`([A-Z][a-zA-Z .]+),\\s*(${STATE_RE})\\b`));
    return m ? { city: m[1].trim(), region: m[2] } : {};
  }
  const one = Array.isArray(addr) ? addr[0] : addr;
  return {
    city: typeof one?.addressLocality === "string" ? one.addressLocality : undefined,
    region: typeof one?.addressRegion === "string" ? one.addressRegion : undefined,
  };
}

/** "$$" / "$$$$" style priceRange → our three bands. */
function bandFromPriceRange(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const dollars = raw.match(/\$+/)?.[0].length ?? 0;
  if (dollars === 0) return undefined;
  return dollars <= 1 ? "$" : dollars === 2 ? "$$" : "$$$";
}

function priceFrom(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string") {
    const m = value.match(/\d{1,4}(?:\.\d{2})?/);
    if (m && parseFloat(m[0]) > 0) return m[0];
  }
  return undefined;
}

/**
 * Priced offerings anywhere in the JSON-LD graph: MenuItem/Product/Service
 * nodes (and Offer.itemOffered) with a price on the node, its offers, or a
 * priceSpecification. This is where Squarespace/Wix/Toast sites keep the
 * menu the visible HTML renders with JavaScript.
 */
function jsonLdPricedItems(nodes: LdNode[]): ImportedService[] {
  const out: ImportedService[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const n = node as LdNode;
    const type = nodeType(n);
    const named = /MenuItem|Product|Service/i.test(type) ? n : /Offer/i.test(type) ? (n.itemOffered as LdNode | undefined) : undefined;
    if (named && typeof named.name === "string") {
      const offer = Array.isArray(n.offers) ? n.offers[0] : (n.offers ?? n);
      const price =
        priceFrom((offer as LdNode)?.price) ??
        priceFrom((offer as LdNode)?.priceSpecification?.price) ??
        priceFrom(n.price);
      if (price) {
        const name = decodeEntities(named.name).replace(/\s+/g, " ").trim().slice(0, 60);
        const key = name.toLowerCase();
        if (name.length >= 3 && !JUNK_SERVICE_NAME.test(name) && !seen.has(key)) {
          seen.add(key);
          out.push({ name, price });
        }
      }
    }
    for (const key of ["hasMenu", "hasMenuSection", "hasMenuItem", "itemListElement", "makesOffer", "offers", "itemOffered"]) {
      if (n[key]) visit(n[key], depth + 1);
    }
  };
  for (const n of nodes) visit(n, 0);
  return out.slice(0, 15);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function classifyCategory(text: string): (typeof CATEGORIES)[number] | undefined {
  let best: { cat: (typeof CATEGORIES)[number]; count: number } | undefined;
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    const count = text.match(new RegExp(re.source, "gi"))?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { cat, count };
  }
  return best?.cat;
}

// Storefront chrome and checkout math, not offerings.
const JUNK_SERVICE_NAME =
  /total|subtotal|shipping|delivery fee|tax|minimum|gift card|^(sale price|original price|regular price|unit price|price|from|starting at|now|was|save|only|add to cart)\b|[:：]$/i;

/** Lines that look like "<offering> … $<price>" become service candidates. */
function extractPricedItems(lines: string[]): ImportedService[] {
  const out: ImportedService[] = [];
  const seen = new Set<string>();
  const re = /^(.{3,48}?)[\s.·…—–‒―⎯|-]*\$\s?(\d{1,4}(?:\.\d{2})?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const name = m[1].replace(/[\s.·…—–‒―⎯|-]+$/, "").trim();
    if (name.length < 3 || JUNK_SERVICE_NAME.test(name)) continue;
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
  const nodes = collectJsonLdNodes(html);

  // Priced items: structured data first (it survives JS-rendered menus),
  // "<item> … $<price>" text lines fill the gaps.
  const services = jsonLdPricedItems(nodes);
  const seen = new Set(services.map((s) => s.name.toLowerCase()));
  for (const svc of extractPricedItems(lines)) {
    if (services.length >= 15) break;
    if (seen.has(svc.name.toLowerCase())) continue;
    seen.add(svc.name.toLowerCase());
    services.push(svc);
  }
  const result: SiteImport = { services };

  const ld = findIdentityNode(nodes);
  if (typeof ld?.name === "string") result.name = decodeEntities(ld.name).trim().slice(0, 60);
  const addr = ld ? addressParts(ld) : {};
  if (addr.city) result.city = addr.city;
  if (addr.region) result.region = addr.region;
  if (typeof ld?.description === "string") {
    result.voiceHint = decodeEntities(ld.description).slice(0, 200);
  }
  result.priceBand = bandFromPriceRange(ld?.priceRange);

  if (!result.name) {
    const title = html.match(/<title[^>]*>([\s\S]{1,120}?)<\/title>/i)?.[1];
    if (title) {
      result.name = decodeEntities(title.split(/\s*[|–—·:]\s*/)[0]).replace(/\s+/g, " ").trim().slice(0, 60);
    }
  }
  if (!result.city) {
    const m = text.match(new RegExp(`([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?),\\s*(${STATE_RE})\\b`));
    if (m) {
      result.city = m[1];
      result.region = m[2];
    }
  }
  result.category = classifyCategory(text);
  if (!result.voiceHint) {
    const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,200})["']/i)?.[1];
    if (desc) result.voiceHint = decodeEntities(desc);
  }
  return result;
}

/** Plain text of one HTML page — for feeding page copy to the analysis. */
export function htmlToText(html: string): string {
  return stripHtml(html).text;
}

/* -------------------------- storefront JSON probes -------------------------
 * Shopify and WooCommerce render their catalogs with JavaScript, so the HTML
 * crawl sees a husk — but both expose the same catalog as public JSON. In
 * serverless prod (no Playwright) these probes are the only way to read
 * products off such sites; a non-storefront host just 404s in one request.
 */

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

function cleanProductName(raw: string): string | null {
  const name = decodeEntities(raw).replace(/\s+/g, " ").trim().slice(0, 60);
  return name.length >= 3 && !JUNK_SERVICE_NAME.test(name) ? name : null;
}

/** Shopify's public catalog: /products.json. */
async function probeShopify(origin: string): Promise<ImportedService[]> {
  const data = (await fetchJson(`${origin}/products.json?limit=50`)) as {
    products?: { title?: string; variants?: { price?: string | number }[] }[];
  };
  const out: ImportedService[] = [];
  for (const p of data.products ?? []) {
    const name = typeof p.title === "string" ? cleanProductName(p.title) : null;
    const price = priceFrom(p.variants?.[0]?.price);
    if (name && price) out.push({ name, price });
    if (out.length >= 15) break;
  }
  return out;
}

/** WooCommerce's public Store API: prices arrive in minor units. */
async function probeWooCommerce(origin: string): Promise<ImportedService[]> {
  const data = (await fetchJson(`${origin}/wp-json/wc/store/v1/products?per_page=50`)) as {
    name?: string;
    prices?: { price?: string; currency_minor_unit?: number };
  }[];
  if (!Array.isArray(data)) return [];
  const out: ImportedService[] = [];
  for (const p of data) {
    const name = typeof p.name === "string" ? cleanProductName(p.name) : null;
    const minor = Number(p.prices?.price);
    const unit = p.prices?.currency_minor_unit ?? 2;
    if (name && Number.isFinite(minor) && minor > 0) {
      out.push({ name, price: (minor / 10 ** unit).toFixed(unit).replace(/\.00$/, "") });
    }
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * When the HTML crawl found no offerings, ask the storefront platforms
 * directly. Tries the platform the HTML hints at first; failures return [].
 */
export async function probeStorefrontProducts(url: string, html: string): Promise<ImportedService[]> {
  const origin = new URL(url).origin;
  const probes = /shopify|\/cdn\/shop\//i.test(html)
    ? [probeShopify, probeWooCommerce]
    : [probeWooCommerce, probeShopify];
  for (const probe of probes) {
    try {
      const services = await probe(origin);
      if (services.length > 0) return services;
    } catch {
      /* not that platform — try the next */
    }
  }
  return [];
}

const JUNK_IMAGE = /logo|icon|favicon|sprite|placeholder|avatar|badge|pixel|tracking/i;

/** Real photos on the page: og:image first, then content <img>s that look
 * like photography rather than chrome. */
export function extractImageUrls(html: string, baseUrl: string, cap = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | undefined | null, requireExt: boolean) => {
    if (!raw || out.length >= cap) return;
    let u: URL;
    try {
      u = new URL(decodeEntities(raw.trim()), baseUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    if (JUNK_IMAGE.test(u.pathname)) return;
    if (requireExt && !/\.(jpe?g|png|webp)$/i.test(u.pathname)) return;
    // Filenames often carry dimensions ("-1024x265") — skip banners and
    // thumbnails: too short, or wider than 3:1 (logo strips).
    const dim = u.pathname.match(/-(\d{2,4})x(\d{2,4})(?=[-.])/);
    if (dim) {
      const w = Number(dim[1]);
      const h = Number(dim[2]);
      if (h < 200 || w / h > 3) return;
    }
    const key = u.origin + u.pathname;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(u.href);
  };
  const og = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  push(og, false);
  for (const m of html.matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)) {
    push(m[1], true);
  }
  return out;
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
  const thresholds = category ? PRICE_BAND_THRESHOLDS[verticalKey(category)] : undefined;
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
    // A subpage can fill what the homepage doesn't carry (city on /contact
    // or /locations).
    if (!result.city && sub.city) {
      result.city = sub.city;
      result.region = result.region ?? sub.region;
    }
    if (!result.priceBand && sub.priceBand) result.priceBand = sub.priceBand;
    if (result.services.length >= 15) break;
  }
  // Category is voted across every crawled page, not won by the first hit.
  result.category =
    classifyCategory(pages.map((p) => htmlToText(p.html)).join("\n")) ?? result.category;
  // Their own photography, pooled across the crawl — homepage first.
  const photos: string[] = [];
  for (const page of pages) {
    for (const url of extractImageUrls(page.html, page.url, 6)) {
      if (photos.length >= 6) break;
      if (!photos.includes(url)) photos.push(url);
    }
    if (photos.length >= 6) break;
  }
  if (photos.length > 0) result.photos = photos;
  // The menu may live on an ordering platform rather than the site itself.
  for (const page of pages) {
    const host = discoverOffsiteMenu(page.html, page.url);
    if (host) {
      result.menuHost = host;
      break;
    }
  }
  // An explicit JSON-LD priceRange beats our median inference.
  result.priceBand = result.priceBand ?? inferPriceBand(result.services, result.category);
  return result;
}
