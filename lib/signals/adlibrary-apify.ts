import { env } from "@/lib/env";

import { runActorSync } from "@/lib/social/apify";

import { CircuitBreaker, fetchText } from "./http";

/**
 * What a NAMED rival is actually running on Meta — the paid, serverless-safe
 * path.
 *
 * `adlibrary.ts` renders the public Ad Library search page with Playwright,
 * which is the honest free read but only exists where a browser is
 * installed; Vercel has none. So the per-rival read that the competitive
 * signal leans on goes through a commercial Apify actor instead, key-gated
 * on APIFY_TOKEN and skipped loudly (a warn, an empty list) without it.
 *
 * The Ad Library will not say how much a US commercial ad spent or how many
 * people saw it — that disclosure is reserved for political and issue ads.
 * The one thing it does say is when an ad started, and an ad still running
 * after three weeks has survived at least two optimization cycles on the
 * rival's own money. That is the strongest "this one is working" evidence
 * the source allows, so runningDays is the read's spine and everything else
 * (themes, CTAs, platforms) hangs off it. The report should say "still
 * running after N days", never "their best performer" — the second claim
 * is one the data cannot back.
 *
 * Every field on the item is optional because actor schemas drift; a
 * renamed key must degrade to a missing fact, never throw mid-run.
 */

/** Overridable via APIFY_ADLIBRARY_ACTOR because actors get renamed and
 * deprecated out from under you. */
const DEFAULT_ACTOR = "curious_coder/facebook-ads-library-scraper";
/** Per-rival cap: cost is per item, and thirty is enough to read a theme. */
/** Depth per advertiser; env ADLIBRARY_RESULTS raises it for brands with real volume. */
const RESULTS_PER_PAGE = env.adLibraryResults;
/** Survived ≥3 weeks on the rival's budget — the "still running" proxy. */
export const PROVEN_DAYS = 21;
const WEEK_DAYS = 7;
/** Every ad the read found, up to a ceiling that keeps a rival with a
 * catalog of hundreds of dynamic ads from filling the row. Five used to be
 * the cap, sized for a card; the research dossier reads the whole list. */
const MAX_SAMPLE = 40;
const SNIPPET_MAX = 280;

/**
 * The actor input this assumes (curious_coder/facebook-ads-library-scraper,
 * Sep 2026): a list of Ad Library URLs to scrape plus a count, with the
 * active-status filter mirrored in the dotted per-page option. If a
 * different actor is configured its schema is its own problem — the mapper
 * below is what keeps a mismatch from being a crash.
 */
export function adLibraryActorInput(pageName: string): Record<string, unknown> {
  // Every country: a brand that advertises only outside the US is not a brand with no ads.
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(pageName)}&search_type=page`;
  return {
    urls: [{ url }],
    count: RESULTS_PER_PAGE,
    "scrapePageAds.activeStatus": "active",
  };
}

export interface AdvertiserAd {
  id: string;
  advertiser: string;
  snippet: string;
  headline: string | null;
  cta: string | null;
  landing: string | null;
  /** yyyy-mm-dd */
  startedOn: string | null;
  runningDays: number | null;
  platforms: string[];
  /** How many creative variants the ad ships under one archive id. */
  variants: number;
  active: boolean;
  url: string;
  /** The advertising Page's profile URL, when the actor carries it. */
  pageUrl?: string | null;
  /** What the creative is: a video (Reels included), an image, a carousel of cards, or a dynamic product ad. */
  kind?: AdKind;
  /** A still of the creative: the video's poster frame or the image itself. Expires; the Library link is the durable one. */
  preview?: string | null;
  /** The video file, when the actor carries it. */
  video?: string | null;
}

export type AdKind = "video" | "image" | "carousel" | "dynamic" | "unknown";

/** Words that say what kind of company it is, not which one: stripped from
 * both names before they are compared. */
const GENERIC_NAME_WORDS = new Set([
  "the", "a", "an", "my", "and", "official", "inc", "llc", "ltd", "co", "company", "corp",
  "hair", "haircare", "skin", "skincare", "beauty", "home", "shop", "store", "brand", "brands", "usa", "us", "uk", "nyc", "la",
]);

/** "Dae Hair" → ["dae"]; "My Filterbaby" → ["filterbaby"]; "Roz Strategies" → ["roz", "strategies"]. */
export function nameCore(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !GENERIC_NAME_WORDS.has(w));
}

/**
 * Is this ad the rival's? By the Page's handle against the rival's
 * Facebook handle from its own site, or by name. The name match is strict:
 * the two names must be the same company once the generic words are gone
 * ("Dae" is "Dae Hair", "My Filterbaby" is "Filterbaby", "ActandAcre" is
 * "Act+Acre"), never a substring. A substring match filed "Roz
 * Strategies", "Dr. Roz MD" and "German Roz" under a haircare brand called
 * Roz, and "Crane & Canopy" under a shower-filter brand called Canopy, and
 * their IRS-penalty guides became that brand's competitive read.
 */
export function isRivalAd(rival: { name: string; facebook?: string | null }, ad: Pick<AdvertiserAd, "advertiser" | "pageUrl">): boolean {
  const handle = (rival.facebook ?? "").toLowerCase().replace(/^@/, "").replace(/\/+$/, "");
  if (handle && ad.pageUrl) {
    const path = ad.pageUrl.toLowerCase().replace(/^https?:\/\/(www\.)?facebook\.com\//, "").replace(/\/+$/, "").split(/[?#]/)[0];
    if (path === handle || path === `pages/${handle}`) return true;
  }
  const a = nameCore(ad.advertiser);
  const r = nameCore(rival.name);
  if (a.length === 0 || r.length === 0) return false;
  if (a.length === r.length && a.every((w, i) => w === r[i])) return true;
  // One word each side once squashed: "actandacre" vs "act acre" → "actacre".
  const squash = (ws: string[]) => ws.join("").replace(/and/g, "");
  return squash(a) === squash(r);
}

export type AdTheme = "education" | "offer" | "scarcity" | "social_proof" | "speed" | "novelty";

export interface AdvertiserRead {
  active: number;
  longestRunningDays: number | null;
  newThisWeek: number;
  /** Ads running ≥21 days — the honest "this one is working" proxy the Ad
   * Library allows (no spend/reach for US commercial ads). */
  proven: AdvertiserAd[];
  themes: { theme: AdTheme; count: number }[];
  /** ≤5, proven first. */
  sample: AdvertiserAd[];
}

/* ------------------------------- mapping -------------------------------- */

type Item = Record<string, unknown>;

function asRecord(v: unknown): Item | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Item) : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function pick(item: Item, ...keys: string[]): unknown {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null) return item[k];
  }
  return undefined;
}

/** Unix seconds, unix millis, or ISO — the actor has shipped all three. */
export function toDay(v: unknown): string | null {
  let ms: number | null = null;
  const n = num(v);
  if (n !== null) {
    ms = n > 1e12 ? n : n * 1000;
  } else if (typeof v === "string" && v.trim()) {
    const parsed = Date.parse(v);
    ms = Number.isFinite(parsed) ? parsed : null;
  }
  if (ms === null) return null;
  const day = new Date(ms).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function daysBetween(day: string, now: Date): number | null {
  const start = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / 86400_000));
}

function stringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => str(x)).filter((x): x is string => x !== null).map((x) => x.toLowerCase());
  }
  const single = str(v);
  return single ? [single.toLowerCase()] : [];
}

/** Snapshot text fields arrive as strings, `{ text }`, or arrays of either. */
function snapshotText(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = snapshotText(x);
      if (t) return t;
    }
    return null;
  }
  const rec = asRecord(v);
  if (rec) return str(rec.text) ?? str(rec.title) ?? null;
  return str(v);
}

/** Dynamic ads carry template slots ("{{product.name}} Metal Poster"); they are not words a person saw. */
function cleanCopy(s: string | null): string {
  return (s ?? "")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s—–\-·:,.]+|[\s—–\-·:,]+$/g, "")
    .trim();
}

/** The creative's kind, from the actor's display_format or from what media it carries. */
function kindOf(snapshot: Item, videos: Item[], images: Item[], cards: Item[]): AdKind {
  const fmt = (str(pick(snapshot, "display_format", "displayFormat")) ?? "").toUpperCase();
  if (fmt === "VIDEO") return "video";
  if (fmt === "IMAGE") return "image";
  if (fmt === "CAROUSEL" || fmt === "MULTI_IMAGES" || fmt === "MULTI_VIDEOS" || fmt === "MULTI_MEDIAS") return "carousel";
  if (fmt === "DCO" || fmt === "DPA") return "dynamic";
  if (videos.length > 0 || cards.some((c) => str(pick(c, "video_hd_url", "video_sd_url", "videoHdUrl")))) return "video";
  if (cards.length > 1) return "carousel";
  if (images.length > 0 || cards.some((c) => str(pick(c, "original_image_url", "resized_image_url", "originalImageUrl")))) return "image";
  return "unknown";
}

function records(v: unknown): Item[] {
  return Array.isArray(v) ? v.map(asRecord).filter((x): x is Item => x !== null) : [];
}

/** Pure mapper over the actor's dataset — tolerant of every key spelling
 * the actor has used. Items without an id are dropped (nothing to dedupe or
 * link on). Image-only ads with no text are KEPT: "they are running twelve
 * ads" is true whether or not we can read the words, so they count toward
 * active and proven; readAdvertiser just leaves them out of the theme mix. */
export function toAdvertiserAds(items: unknown[], now = new Date()): AdvertiserAd[] {
  const out: AdvertiserAd[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const snapshot = asRecord(pick(item, "snapshot")) ?? {};
    const id = str(pick(item, "ad_archive_id", "adArchiveID", "adArchiveId", "id"));
    if (!id || seen.has(id)) continue;

    const body = asRecord(snapshot.body);
    const cards = records(pick(snapshot, "cards"));
    const videos = records(pick(snapshot, "videos"));
    const images = records(pick(snapshot, "images"));
    // The words a person saw: the body, or for a carousel or dynamic ad whose
    // body is a template, the first card's.
    const bodyText = cleanCopy((body ? str(body.text) : str(snapshot.body)) ?? snapshotText(pick(item, "body", "text", "ad_creative_body")) ?? null);
    const cardText = cleanCopy(cards.map((c) => str(pick(c, "body", "text"))).find((t) => t && cleanCopy(t)) ?? null);
    const snippet = (bodyText || cardText).slice(0, SNIPPET_MAX);
    const headline = cleanCopy(
      snapshotText(pick(snapshot, "title", "headline")) ??
        snapshotText(pick(item, "title", "headline")) ??
        cards.map((c) => str(pick(c, "title"))).find(Boolean) ??
        snapshotText(pick(snapshot, "link_description", "linkDescription")),
    );
    const kind = kindOf(snapshot, videos, images, cards);
    const preview =
      str(pick(videos[0] ?? {}, "video_preview_image_url", "videoPreviewImageUrl")) ??
      str(pick(images[0] ?? {}, "original_image_url", "resized_image_url", "originalImageUrl", "resizedImageUrl")) ??
      cards.map((c) => str(pick(c, "video_preview_image_url", "original_image_url", "resized_image_url"))).find(Boolean) ??
      null;
    const video =
      str(pick(videos[0] ?? {}, "video_hd_url", "video_sd_url", "videoHdUrl", "videoSdUrl")) ??
      cards.map((c) => str(pick(c, "video_hd_url", "video_sd_url"))).find(Boolean) ??
      null;

    const startedOn = toDay(pick(item, "start_date", "startDate", "start_date_string", "startDateFormatted"));
    const endedOn = toDay(pick(item, "end_date", "endDate"));
    const isActive = pick(item, "is_active", "isActive");
    // No explicit flag: an ad with no end date (or one still in the future)
    // is the best guess for "still running".
    const active =
      typeof isActive === "boolean"
        ? isActive
        : endedOn === null || Date.parse(`${endedOn}T23:59:59Z`) >= now.getTime();

    seen.add(id);
    out.push({
      id,
      advertiser: cleanCopy(str(pick(item, "page_name", "pageName", "advertiser"))),
      snippet,
      headline: headline || null,
      cta: cleanCopy(str(pick(snapshot, "cta_text", "ctaText")) ?? str(pick(item, "cta_text", "ctaText"))) || null,
      landing: str(pick(snapshot, "link_url", "linkUrl")) ?? str(pick(item, "link_url", "linkUrl")),
      startedOn,
      runningDays: startedOn ? daysBetween(startedOn, now) : null,
      platforms: stringList(pick(item, "publisher_platform", "publisherPlatform", "publisher_platforms")),
      variants: Math.max(1, Math.round(num(pick(item, "collation_count", "collationCount")) ?? 1)),
      active,
      url:
        str(pick(item, "ad_snapshot_url", "adSnapshotUrl", "url")) ??
        `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
      pageUrl: str(pick(snapshot, "page_profile_uri", "pageProfileUri")) ?? str(pick(item, "page_profile_uri", "pageUrl")),
      kind,
      preview,
      video,
    });
  }
  return out;
}

/* -------------------------------- themes -------------------------------- */

// Bare "only", "last", "today" and "first" are deliberately absent: "the
// only bakery in town", "call today" and "your first visit" are how every
// local ad talks, and letting them count would put half of all copy in the
// wrong bucket. Each word here has to carry the theme on its own.
const OFFER = /(\$\s?\d|\d\s?%|\bpercent\b|\bfree\b|\bdeals?\b|\bspecials?\b|\bdiscounts?\b|\bsave\b|\bcoupons?\b|\bbogo\b|\b\d+\s?off\b|\bhalf off\b|\bhappy hour\b)/i;
const SCARCITY = /(\blimited\b|\bonly \d+\b|\bonly a few\b|\blast chance\b|\bends (soon|today|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(this )?(week|weekend) only\b|\bspots? left\b|\bseats? left\b|\bwhile supplies last\b|\bhurry\b|\bdon'?t miss\b|\bfinal (days?|hours?|weekend)\b|\bselling out\b|\bbefore (it'?s|they'?re) gone\b)/i;
const SPEED = /(\bsame[- ]day\b|\bfast\b|\b24 ?(hours?|hrs?|\/7)\b|\bin minutes\b|\bquick\b|\bnext[- ]day\b|\bopen now\b|\binstant(ly)?\b|\bno wait\b|\bwalk[- ]ins?\b|\bready in\b|\bwhile you wait\b|\bemergency\b)/i;
const SOCIAL_PROOF = /(\brated\b|\breviews?\b|\bcustomers\b|\bloved\b|\btrusted\b|\bawards?\b|\baward[- ]winning\b|\b5[- ]star\b|\bfive[- ]star\b|\bvoted\b|\bbest of\b|#1\b|\bfamilies\b|\bthousands\b|\bneighbors\b)/i;
const NOVELTY = /(\bnew\b|\bintroducing\b|\bjust launched\b|\bbrand[- ]new\b|\bnow serving\b|\bnow offering\b|\bnow open\b|\blaunch(ed|ing)?\b|\bfinally here\b|\bjust dropped\b|\bgrand opening\b)/i;
const EDUCATION = /(\bdid you know\b|\bhow to\b|\bwhy\b|\btips?\b|\bthe truth\b|\bmistakes?\b|\bwhat (is|are|to)\b|\bguide\b|\blearn\b|\bexplained\b|\bsigns? (that|of|you)\b|\bmyths?\b|\bthe difference\b)/i;

/**
 * Deterministic keyword rules, checked in a fixed order so the same copy
 * always lands in the same bucket. Order is by how specific the tell is:
 * a dollar sign or a countdown is unmistakable, "why" and "new" are looser.
 * A question mark with no offer words reads as explanatory; plain
 * declarative copy with nothing else going on is an offer, because that is
 * what most local ads are.
 */
export function classifyAdCopy(text: string): AdTheme {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "offer";
  if (SCARCITY.test(t)) return "scarcity";
  if (OFFER.test(t)) return "offer";
  if (SOCIAL_PROOF.test(t)) return "social_proof";
  if (SPEED.test(t)) return "speed";
  if (EDUCATION.test(t)) return "education";
  if (NOVELTY.test(t)) return "novelty";
  return t.includes("?") ? "education" : "offer";
}

function adText(ad: AdvertiserAd): string {
  return [ad.headline, ad.snippet].filter(Boolean).join(" ");
}

/* --------------------------------- read --------------------------------- */

/** Pure: the per-rival read the competitive signal quotes. */
export function readAdvertiser(ads: AdvertiserAd[], now = new Date()): AdvertiserRead {
  // Running days are recomputed against `now` rather than trusted from the
  // mapper, so a cached read quoted a week later still says the right number.
  const live = ads
    .filter((a) => a.active)
    .map((a) => (a.startedOn ? { ...a, runningDays: daysBetween(a.startedOn, now) ?? a.runningDays } : a));
  const withDays = live.filter((a) => a.runningDays !== null);
  const byLongest = [...withDays].sort((a, b) => (b.runningDays ?? 0) - (a.runningDays ?? 0));

  const proven = byLongest.filter((a) => (a.runningDays ?? 0) >= PROVEN_DAYS);
  const newThisWeek = withDays.filter((a) => (a.runningDays ?? 0) < WEEK_DAYS).length;

  const themeCounts = new Map<AdTheme, number>();
  for (const ad of live) {
    const text = adText(ad);
    // An image-only ad has no words to classify; counting it as the default
    // "offer" would invent a theme the rival never wrote.
    if (!text.trim()) continue;
    const theme = classifyAdCopy(text);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const themes = [...themeCounts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));

  // Proven first, then the longest-running of the rest, then undated ads —
  // so the swipe file leads with what has survived, not what is newest.
  const rest = live.filter((a) => !proven.includes(a));
  const restSorted = [
    ...rest.filter((a) => a.runningDays !== null).sort((a, b) => (b.runningDays ?? 0) - (a.runningDays ?? 0)),
    ...rest.filter((a) => a.runningDays === null),
  ];
  const sample = [...proven, ...restSorted].slice(0, MAX_SAMPLE);

  return {
    active: live.length,
    longestRunningDays: byLongest[0]?.runningDays ?? null,
    newThisWeek,
    proven,
    themes,
    sample,
  };
}

/* -------------------------------- fetch --------------------------------- */

export function isAdLibraryApifyAvailable(): boolean {
  return Boolean(env.apifyToken);
}

const breaker = new CircuitBreaker("adlibrary_apify");

/**
 * The rival's ads by Page name. Key-gated; every failure is a warn and an
 * empty list when the token is unset; a read that fails throws, so a
 * caller never mistakes an outage for a quiet advertiser.
 */
export async function fetchAdvertiserAds(
  pageName: string,
  opts: { fetchText?: typeof fetchText } = {},
): Promise<AdvertiserAd[]> {
  const name = pageName.trim();
  if (!name) return [];
  if (!isAdLibraryApifyAvailable()) {
    console.warn(`[signals:adlibrary_apify] APIFY_TOKEN unset — skipping "${name}"`);
    return [];
  }
  const actor = env.apifyAdLibraryActor || DEFAULT_ACTOR;
  try {
    // The shared call meters the run (this path billed unmetered before).
    // Strict: a body that is not JSON throws, because an empty list here is
    // written up as "no active Meta ads".
    const items = await runActorSync<unknown>(actor, adLibraryActorInput(name), { breaker, fetchText: opts.fetchText, strict: true });
    return toAdvertiserAds(items);
  } catch (err) {
    // A failed read is not "no ads". Callers store nothing and read again
    // tomorrow; an empty list here was written up as "no active Meta ads"
    // for rivals whose read never happened.
    console.warn(`[signals:adlibrary_apify] "${name}" failed:`, (err as Error).message);
    throw err;
  }
}
