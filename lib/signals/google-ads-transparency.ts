import { env } from "@/lib/env";

import { CircuitBreaker, fetchText } from "./http";

/**
 * Google Ads Transparency Center — what a rival's DOMAIN is running on
 * Google (Search, YouTube, Display), by format and by when each creative
 * was first and last shown.
 *
 * Google discloses less than Meta here: no CTA, no landing page, no
 * variant count, and for image/video ads no text at all. What it does give
 * is a first/last-shown pair per creative, which is the same "how long has
 * this survived on their money" evidence the Meta read leans on, plus the
 * format mix — a rival who has moved to video is telling you something.
 *
 * Two paths, in order: a paid Apify actor whenever APIFY_TOKEN is set (the
 * store's default below, or APIFY_GOOGLE_ADS_ACTOR), else the same
 * Playwright renderer the free Meta read uses. Neither present → [] with a
 * warn, never a throw.
 */

const RUN_URL = "https://api.apify.com/v2/acts";
const REGION = "US";
const MAX_ADS = 30;
/**
 * The store's most-run Transparency Center actor (verified 2026-09-14: it
 * answers a domain with advertiserName, creativeId, adFormat, firstShown,
 * lastShown and adUrl, which is exactly what the mapper below reads, at
 * $0.0015 an item). Overridable via APIFY_GOOGLE_ADS_ACTOR; before this
 * default existed the read never ran in production at all.
 */
const DEFAULT_ACTOR = "solidcode/ads-transparency-scraper";
const SNIPPET_MAX = 280;

export interface GoogleAd {
  id: string;
  advertiser: string;
  format: "text" | "image" | "video" | "unknown";
  snippet: string;
  /** yyyy-mm-dd */
  firstShown: string | null;
  lastShown: string | null;
  url: string;
}

export function transparencyUrl(domain: string): string {
  return `https://adstransparency.google.com/?region=${REGION}&domain=${encodeURIComponent(domain)}`;
}

/* -------------------------------- helpers -------------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** "Sep 10, 2026", "10 Sep 2026", "9/10/2026", "2026-09-10" → yyyy-mm-dd. */
export function toDay(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (y: number, m: number, d: number) =>
    y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mon ? build(Number(m[3]), mon, Number(m[2])) : null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mon ? build(Number(m[3]), mon, Number(m[1])) : null;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return build(Number(m[3]), Number(m[1]), Number(m[2]));
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function toFormat(v: unknown): GoogleAd["format"] {
  const s = String(v ?? "").toLowerCase();
  if (/video/.test(s)) return "video";
  if (/image|display|banner/.test(s)) return "image";
  if (/text|search/.test(s)) return "text";
  return "unknown";
}

/** Short, stable id from the fields that make a card distinct — the page
 * exposes no creative id in its visible text. */
function fingerprint(parts: (string | null)[]): string {
  const s = parts.map((p) => p ?? "").join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* --------------------------- rendered-page parser -------------------------- */

const FORMAT_LINE = /^(text|image|video)(\s+ad)?$/i;
const SHOWN_LINE = /^(first|last)\s+shown:?\s*(.+)$/i;
const NOISE_LINE =
  /^(ads? transparency cent(er|re)|region:?.*|showing .*|sort( by)?.*|filters?|search|verified advertiser.*|legal name:?.*|see (more|all|details).*|about this (ad|advertiser).*|report (this )?ad.*|\d[\d,]*\+? ads?( found)?|load more|advertiser:?.*|all formats|any (format|time|date)|topic.*|sign in|privacy|terms|help|feedback|more ads)$/i;
const DOMAIN_LINE = /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i;

/**
 * Pure parser over the Transparency Center's visible text. The page is a
 * client-rendered grid; each card shows a format badge, the ad's text
 * (text ads only), and one or two "shown" date lines. The fixture in
 * tests/rival-ads.test.ts is APPROXIMATE — reconstructed from the layout,
 * not copied from a live render — so this parser must treat everything as
 * optional and degrade to [] rather than throw. A card is only real once it
 * has a date line; a format badge opens a new card and closes the last.
 */
export function parseTransparencyText(text: string, opts: { domain?: string } = {}): GoogleAd[] {
  const lines = (text ?? "")
    .split("\n")
    .map((l) => l.replace(/[​‎‏]/g, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const url = opts.domain ? transparencyUrl(opts.domain) : "https://adstransparency.google.com/";
  const advertiser = findAdvertiser(lines, opts.domain ?? "");

  const out: GoogleAd[] = [];
  const seen = new Set<string>();
  let format: GoogleAd["format"] = "unknown";
  let copy: string[] = [];
  let firstShown: string | null = null;
  let lastShown: string | null = null;
  let hasDates = false;
  let inCard = false;
  // Header lines above the first card (advertiser name, filters) are chrome.
  // Once one card has closed, the grid has started, and a plain text line
  // after a date is the next card's copy even when no format badge showed.
  let gridStarted = false;

  const flush = () => {
    if (hasDates) {
      const snippet = copy.join(" ").replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX);
      const id = fingerprint([advertiser, format, snippet, firstShown, lastShown]);
      if (!seen.has(id) && out.length < MAX_ADS) {
        seen.add(id);
        out.push({ id, advertiser, format, snippet, firstShown, lastShown, url });
      }
    }
    format = "unknown";
    copy = [];
    firstShown = null;
    lastShown = null;
    if (hasDates) gridStarted = true;
    hasDates = false;
    inCard = gridStarted;
  };

  for (const line of lines) {
    const shown = line.match(SHOWN_LINE);
    if (shown) {
      const day = toDay(shown[2]);
      if (/^first/i.test(shown[1])) firstShown = day;
      else lastShown = day;
      // A "shown" label whose date we cannot read proves nothing; only a
      // parsed date makes the card real.
      hasDates = hasDates || day !== null;
      inCard = true;
      continue;
    }
    // Any non-date line after the dates is the next card starting.
    if (hasDates) flush();
    if (FORMAT_LINE.test(line)) {
      flush();
      format = toFormat(line);
      inCard = true;
      continue;
    }
    if (!inCard || NOISE_LINE.test(line) || DOMAIN_LINE.test(line)) continue;
    if (line.toLowerCase() === advertiser.toLowerCase()) continue;
    copy.push(line);
  }
  flush();
  return out;
}

/** The advertiser's name sits above the grid, next to "Verified advertiser"
 * or a legal-name line; fall back to an explicit "Advertiser:" label, then
 * the domain — a nameless card is still worth a row. */
function findAdvertiser(lines: string[], domain: string): string {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const m = lines[i].match(/^advertiser:?\s+(.+)$/i);
    if (m) return m[1].trim();
    if (/^(verified advertiser|legal name)/i.test(lines[i]) && i > 0) {
      const prev = lines[i - 1];
      if (!NOISE_LINE.test(prev) && !FORMAT_LINE.test(prev) && !DOMAIN_LINE.test(prev)) return prev;
    }
  }
  return domain;
}

/* ------------------------------ apify mapper ------------------------------ */

type Item = Record<string, unknown>;

function asRecord(v: unknown): Item | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Item) : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pick(item: Item, ...keys: string[]): unknown {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null) return item[k];
  }
  return undefined;
}

/**
 * Pure mapper for whatever Google-ads-transparency actor is configured.
 * There is no single dominant actor here (unlike the Meta read), so the
 * key list is a union of the spellings seen across the store; a miss is a
 * missing fact, not a crash.
 */
export function toGoogleAds(items: unknown[], domain: string): GoogleAd[] {
  const out: GoogleAd[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const advertiser =
      str(pick(item, "advertiser", "advertiserName", "advertiser_name", "advertiserDisplayName")) ?? domain;
    const snippet = (
      str(pick(item, "text", "body", "snippet", "headline", "description", "adText", "ad_text")) ?? ""
    )
      .replace(/\s+/g, " ")
      .slice(0, SNIPPET_MAX);
    const firstShown = toDay(pick(item, "firstShown", "first_shown", "firstShownDate", "firstShownAt", "startDate"));
    const lastShown = toDay(pick(item, "lastShown", "last_shown", "lastShownDate", "lastShownAt", "endDate"));
    const format = toFormat(pick(item, "format", "adFormat", "ad_format", "type", "creativeType"));
    const id =
      str(pick(item, "id", "adId", "ad_id", "creativeId", "creative_id")) ??
      fingerprint([advertiser, format, snippet, firstShown, lastShown]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      advertiser,
      format,
      snippet,
      firstShown,
      lastShown,
      url: str(pick(item, "url", "adUrl", "ad_url", "link", "detailsUrl")) ?? transparencyUrl(domain),
    });
    if (out.length >= MAX_ADS) break;
  }
  return out;
}

/* ---------------------------------- read ---------------------------------- */

/** Last shown inside two weeks counts as live. The Transparency Center lags
 * a few days behind delivery, so a tighter window would call running ads
 * dead; a looser one would count a campaign that ended last month. */
export const GOOGLE_ACTIVE_DAYS = 14;
const GOOGLE_SAMPLE = 3;

export interface GoogleAdsRead {
  active: number;
  formats: Record<GoogleAd["format"], number>;
  /** ≤3: live ads first, longest-running first, because a creative that has
   * been shown for months is the one worth showing the owner. */
  sample: GoogleAd[];
}

function dayMs(day: string | null, endOfDay = false): number | null {
  if (!day) return null;
  const ms = Date.parse(`${day}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** Pure: the per-domain Google read the competitive signal quotes. */
export function readGoogleAds(ads: GoogleAd[], now = new Date()): GoogleAdsRead {
  const cutoff = now.getTime() - GOOGLE_ACTIVE_DAYS * 86400_000;
  const isLive = (a: GoogleAd) => (dayMs(a.lastShown, true) ?? -Infinity) >= cutoff;
  const runMs = (a: GoogleAd) => {
    const first = dayMs(a.firstShown);
    const last = dayMs(a.lastShown);
    return first !== null && last !== null ? Math.max(0, last - first) : 0;
  };

  const formats: Record<GoogleAd["format"], number> = { text: 0, image: 0, video: 0, unknown: 0 };
  for (const ad of ads) formats[ad.format] += 1;

  const live = ads.filter(isLive).sort((a, b) => runMs(b) - runMs(a));
  const past = ads
    .filter((a) => !isLive(a))
    .sort((a, b) => (dayMs(b.lastShown) ?? 0) - (dayMs(a.lastShown) ?? 0));

  return { active: live.length, formats, sample: [...live, ...past].slice(0, GOOGLE_SAMPLE) };
}

/* --------------------------------- fetch ---------------------------------- */

const breaker = new CircuitBreaker("google_ads_transparency");

function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

/**
 * A domain's Google ads. Apify when an actor is configured, else the
 * Playwright renderer, else []. Every failure is a warn and an empty list.
 */
export async function fetchGoogleAds(
  domain: string,
  opts: { fetchText?: typeof fetchText } = {},
): Promise<GoogleAd[]> {
  const host = cleanDomain(domain);
  if (!host) return [];

  if (env.apifyToken) {
    const doFetchText = opts.fetchText ?? fetchText;
    const actor = (env.apifyGoogleAdsActor || DEFAULT_ACTOR).trim().replace("/", "~");
    try {
      const text = await doFetchText(
        `${RUN_URL}/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Both spellings the store's actors take: the default reads
          // searchQuery, others read domains. Unknown keys are ignored.
          body: JSON.stringify({ searchQuery: host, domains: [host], region: REGION, maxResults: MAX_ADS }),
          breaker,
        },
      );
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? toGoogleAds(parsed, host) : [];
    } catch (err) {
      console.warn(`[signals:google_ads] apify "${host}" failed:`, (err as Error).message);
      return [];
    }
  }

  try {
    const { getRenderer } = await import("@/lib/import/render");
    const renderer = await getRenderer();
    if (!renderer) {
      console.warn(`[signals:google_ads] no actor and no renderer — skipping "${host}"`);
      return [];
    }
    try {
      const html = await renderer.render(transparencyUrl(host));
      if (!html) return [];
      const { htmlToText } = await import("@/lib/import/website");
      return parseTransparencyText(htmlToText(html), { domain: host });
    } finally {
      await renderer.close();
    }
  } catch (err) {
    console.warn(`[signals:google_ads] render "${host}" failed:`, (err as Error).message);
    return [];
  }
}
