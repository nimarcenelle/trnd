import { safeText } from "@/lib/format";
import type { AdFormat } from "@/lib/db/types";

/**
 * Pure parsing of what the Meta Ad Library page carries. The page is a React
 * app, but the first page of results ships inside the HTML as JSON (the
 * `search_results_connection` of the search query), and every later page comes
 * back from the same GraphQL query as JSON. Rather than hard-code the path to
 * the ads, which Meta moves around, we walk every JSON value we can find and
 * keep any object that looks like an ad: it has an `ad_archive_id` and a
 * `snapshot`. The Apify actor's dataset items have the same shape, so the
 * fallback goes through here too.
 */

export interface ScrapedAd {
  archiveId: string;
  /** The day the ad stopped, for an inactive ad; null while it runs. */
  endedAt?: string | null;
  pageId: string | null;
  pageName: string | null;
  /** The Page's facebook.com address, e.g. "https://www.facebook.com/brand/". */
  pageUrl: string | null;
  body: string | null;
  title: string | null;
  cta: string | null;
  linkUrl: string | null;
  format: AdFormat;
  imageUrl: string | null;
  videoUrl: string | null;
  platforms: string[];
  variants: number;
  /** yyyy-mm-dd */
  startedAt: string | null;
  active: boolean;
}

export interface PageResult {
  ads: ScrapedAd[];
  /** Total results Meta says the search has, when it says. */
  count: number | null;
  cursor: string | null;
  hasNext: boolean;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Every JSON payload in an HTML document: `<script type="application/json">` blocks. */
export function jsonBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  for (const m of html.matchAll(re)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // not JSON after all
    }
  }
  return out;
}

/** A GraphQL answer: `for (;;);`-prefixed, sometimes several JSON documents on separate lines. */
export function graphqlBlocks(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.replace(/^for \(;;\);/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // partial line
    }
  }
  return out;
}

function walk(node: unknown, visit: (o: Obj, key: string | null) => boolean, key: string | null = null): void {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, visit, key);
    return;
  }
  if (!isObj(node)) return;
  if (visit(node, key)) return; // the visitor took this subtree
  for (const [k, v] of Object.entries(node)) walk(v, visit, k);
}

/** Ads and paging info from any number of JSON payloads, deduplicated by archive id. */
export function parsePayloads(payloads: unknown[]): PageResult {
  const ads = new Map<string, ScrapedAd>();
  let count: number | null = null;
  let cursor: string | null = null;
  let hasNext = false;
  for (const payload of payloads) {
    walk(payload, (o, key) => {
      if (key === "search_results_connection") {
        if (typeof o.count === "number") count = o.count;
        const info = o.page_info;
        if (isObj(info)) {
          cursor = str(info.end_cursor);
          hasNext = info.has_next_page === true;
        }
      }
      if (("ad_archive_id" in o || "adArchiveID" in o) && isObj(o.snapshot)) {
        const ad = toScrapedAd(o);
        if (ad && !ads.has(ad.archiveId)) ads.set(ad.archiveId, ad);
        return true;
      }
      return false;
    });
  }
  return { ads: [...ads.values()], count, cursor, hasNext };
}

function textOf(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  if (!isObj(v)) return null;
  if (typeof v.text === "string") return str(v.text);
  const markup = v.markup;
  if (isObj(markup) && typeof markup.__html === "string") return str(markup.__html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  return null;
}

/** Dynamic product ads carry template tags instead of copy. */
const TEMPLATE = /\{\{[^}]+\}\}/;

function formatOf(raw: string | null, cards: number, hasVideo: boolean, body: string | null): AdFormat {
  const f = (raw ?? "").toUpperCase();
  if (f === "DCO" || f === "DPA" || (body && TEMPLATE.test(body))) return "dco";
  if (f === "CAROUSEL" || f === "MULTI_IMAGES" || cards > 1) return "carousel";
  if (f === "VIDEO" || hasVideo) return "video";
  if (f === "IMAGE") return "image";
  return "unknown";
}

function day(v: unknown): string | null {
  if (typeof v === "number" && v > 0) return new Date(v * 1000).toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/** One ad object, as the Ad Library (or the Apify actor) returns it. */
export function toScrapedAd(o: Obj): ScrapedAd | null {
  const archiveId = str(o.ad_archive_id ?? o.adArchiveID);
  const snap = o.snapshot;
  if (!archiveId || !isObj(snap)) return null;
  const cards = Array.isArray(snap.cards) ? snap.cards.filter(isObj) : [];
  const images = Array.isArray(snap.images) ? snap.images.filter(isObj) : [];
  const videos = Array.isArray(snap.videos) ? snap.videos.filter(isObj) : [];
  const first = cards[0];

  let body = textOf(snap.body);
  if ((!body || TEMPLATE.test(body)) && first) body = textOf(first.body) ?? body;
  const video = videos[0] ?? (first && (first.video_hd_url || first.video_sd_url) ? first : undefined);
  const videoUrl = video ? str(video.video_hd_url) ?? str(video.video_sd_url) : null;
  const imageUrl =
    (video ? str(video.video_preview_image_url) : null) ??
    (images[0] ? str(images[0].original_image_url) ?? str(images[0].resized_image_url) : null) ??
    (first ? str(first.original_image_url) ?? str(first.resized_image_url) ?? str(first.video_preview_image_url) : null);

  const platforms = (Array.isArray(o.publisher_platform) ? o.publisher_platform : Array.isArray(o.publisherPlatform) ? o.publisherPlatform : [])
    .map((p) => String(p).toLowerCase())
    .filter(Boolean);

  return {
    archiveId,
    pageId: str(o.page_id ?? snap.page_id),
    pageName: str(o.page_name ?? snap.page_name),
    pageUrl: str(snap.page_profile_uri ?? o.page_profile_uri),
    body: body ? safeText(body.slice(0, 2000)) : null,
    title: str(snap.title) ?? (first ? str(first.title) : null),
    cta: str(snap.cta_text) ?? (first ? str(first.cta_text) : null),
    linkUrl: str(snap.link_url) ?? (first ? str(first.link_url) : null),
    format: formatOf(str(snap.display_format), cards.length, Boolean(videoUrl), body),
    imageUrl,
    videoUrl,
    platforms,
    variants: typeof o.collation_count === "number" && o.collation_count > 0 ? o.collation_count : 1,
    startedAt: day(o.start_date ?? o.startDate),
    endedAt: day(o.end_date ?? o.endDate),
    active: o.is_active !== false && o.isActive !== false,
  };
}

/** The tokens the page's own pagination request needs, read off the HTML. */
export function pageTokens(html: string): { lsd: string | null; docId: string | null } {
  const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1] ?? html.match(/name="lsd" value="([^"]+)"/)?.[1] ?? null;
  const docId =
    html.match(/AdLibrarySearchPaginationQuery[^]{0,200}?"queryID":"(\d+)"/)?.[1] ??
    html.match(/"queryID":"(\d+)"[^]{0,200}?AdLibrarySearchPaginationQuery/)?.[1] ??
    null;
  return { lsd, docId };
}

/** Meta answered with a login wall or a checkpoint instead of the library. */
export function looksBlocked(html: string): boolean {
  return /id="login_form"|\/login\/\?next=|checkpoint\/block|You must log in to continue/i.test(html);
}
