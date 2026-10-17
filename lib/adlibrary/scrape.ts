import { assertApifyUp, noteApifyStatus } from "@/lib/apify";
import { env } from "@/lib/env";
import { fetchRetry } from "@/lib/retry";

import { fromMetaApi, isMetaApiConfigured } from "./api";
import { graphqlBlocks, jsonBlocks, looksBlocked, pageTokens, parsePayloads, type ScrapedAd } from "./parse";
import { BROWSER_HEADERS, CookieJar, UA } from "./session";
import { fromWorker, hasWorker } from "./worker";

/**
 * The Meta Ad Library, read the way the browser reads it: GET the library
 * page (the first page of results is in the HTML), then ask the page's own
 * GraphQL query for the rest. No login, no browser, no API key.
 *
 * Meta sometimes answers a datacenter IP with a login wall. The read first
 * looks like a returning browser (lib/adlibrary/session.ts). When the wall
 * still comes up, the same search goes to Meta's official Ad Library API
 * (META_ACCESS_TOKEN: free, but only ads shown in the EU), then to the paid
 * Apify actor if APIFY_TOKEN is set. Without either, the scan says it was
 * blocked.
 */

const LIBRARY = "https://www.facebook.com/ads/library/";
const GRAPHQL = "https://www.facebook.com/api/graphql/";
const PAGE_SIZE = 30;
const jar = new CookieJar();

export type Search = { pageId: string } | { query: string };

export interface ScrapeResult {
  ads: ScrapedAd[];
  /** Every active ad was read. False means a later page could not be fetched,
   * so an ad missing from this read may still be running. */
  complete: boolean;
  via: "worker" | "library" | "api" | "apify";
}

export class ScrapeBlockedError extends Error {}

/** The library URL for a search, active ads only, most impressions first. */
export function libraryUrl(search: Search): string {
  const p = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "ALL",
    is_targeted_country: "false",
    media_type: "all",
  });
  if ("pageId" in search) {
    p.set("search_type", "page");
    p.set("view_all_page_id", search.pageId);
  } else {
    p.set("q", search.query);
    p.set("search_type", "keyword_unordered");
  }
  p.set("sort_data[mode]", "total_impressions");
  p.set("sort_data[direction]", "desc");
  return `${LIBRARY}?${p}`;
}

/** Visit the library once, as a browser would before searching, to pick up its cookies. */
async function warmUp(): Promise<void> {
  const res = await fetchRetry(LIBRARY, { headers: BROWSER_HEADERS, redirect: "follow", timeoutMs: 20_000, cache: "no-store" }).catch(() => null);
  if (!res) return;
  jar.take(res, await res.text().catch(() => ""));
  jar.markWarm();
}

async function libraryPage(search: Search): Promise<{ res: Response; html: string }> {
  if (!jar.warm) await warmUp();
  const cookie = jar.header();
  const res = await fetchRetry(libraryUrl(search), {
    headers: { ...BROWSER_HEADERS, "sec-fetch-site": "same-origin", referer: LIBRARY, ...(cookie ? { cookie } : {}) },
    redirect: "follow",
    timeoutMs: 25_000,
    cache: "no-store",
  });
  const html = await res.text();
  jar.take(res, html);
  return { res, html };
}

async function fromLibrary(search: Search, limit: number): Promise<ScrapeResult> {
  let { res, html } = await libraryPage(search);
  const walled = () => !res.ok || looksBlocked(html) || res.url.includes("/login");
  if (walled()) {
    // A stale or missing session is the usual reason: start a fresh one and try once more.
    jar.reset();
    ({ res, html } = await libraryPage(search));
  }
  if (walled()) {
    throw new ScrapeBlockedError(`Ad Library answered ${res.status}${looksBlocked(html) ? " with a login wall" : ""}`);
  }
  const first = parsePayloads(jsonBlocks(html));
  if (first.ads.length === 0 && first.count === null) {
    // No ads and no result count: not an empty search, a page we cannot read.
    throw new ScrapeBlockedError("Ad Library page carried no results we could read");
  }

  const ads = new Map(first.ads.map((a) => [a.archiveId, a]));
  let { cursor, hasNext } = first;
  const { lsd, docId } = pageTokens(html);
  const cookies = jar.header();
  const sessionId = crypto.randomUUID();

  while (hasNext && cursor && ads.size < limit) {
    if (!lsd || !docId) break;
    const variables = {
      activeStatus: "active",
      adType: "ALL",
      bylines: [],
      collationToken: null,
      contentLanguages: [],
      countries: ["ALL"],
      cursor,
      excludedIDs: null,
      first: PAGE_SIZE,
      isTargetedCountry: false,
      location: null,
      mediaType: "ALL",
      multiCountryFilterMode: null,
      pageIDs: [],
      potentialReachInput: null,
      publisherPlatforms: [],
      queryString: "pageId" in search ? "" : search.query,
      regions: null,
      searchType: "pageId" in search ? "PAGE" : "KEYWORD_UNORDERED",
      sessionID: sessionId,
      sortData: { direction: "DESCENDING", mode: "SORT_BY_TOTAL_IMPRESSIONS" },
      source: null,
      startDate: null,
      viewAllPageID: "pageId" in search ? search.pageId : "0",
    };
    const body = new URLSearchParams({
      av: "0",
      __user: "0",
      __a: "1",
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "AdLibrarySearchPaginationQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: docId,
    });
    let page;
    try {
      const r = await fetchRetry(GRAPHQL, {
        method: "POST",
        headers: {
          "user-agent": UA,
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-lsd": lsd,
          "x-fb-friendly-name": "AdLibrarySearchPaginationQuery",
          origin: "https://www.facebook.com",
          referer: libraryUrl(search),
          ...(cookies ? { cookie: cookies } : {}),
        },
        body,
        timeoutMs: 20_000,
        cache: "no-store",
      });
      if (!r.ok) break;
      page = parsePayloads(graphqlBlocks(await r.text()));
    } catch {
      break;
    }
    const before = ads.size;
    for (const ad of page.ads) ads.set(ad.archiveId, ad);
    if (ads.size === before) break; // no progress: stop rather than loop
    cursor = page.cursor;
    hasNext = page.hasNext;
  }

  const list = [...ads.values()].slice(0, limit);
  const complete = !hasNext || (first.count !== null && list.length >= first.count);
  return { ads: list, complete, via: "library" };
}

/** The same search through the Apify Ad Library actor; its items share Meta's shape. */
async function fromApify(search: Search, wanted: number): Promise<ScrapeResult> {
  // Apify bills per ad: a paid read takes the top APIFY_ADS_PER_RIVAL by impressions, not the full free-read count.
  const limit = Math.min(wanted, env.apifyAdsPerRival);
  const url = `https://api.apify.com/v2/acts/${env.apifyAdLibraryActor}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;
  assertApifyUp();
  const res = await fetchRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls: [{ url: libraryUrl(search) }], count: limit, "scrapePageAds.activeStatus": "active" }),
    timeoutMs: 240_000,
    cache: "no-store",
  });
  noteApifyStatus(res.status);
  if (!res.ok) throw new Error(`Apify Ad Library actor answered ${res.status}`);
  const items = (await res.json()) as unknown[];
  const { ads } = parsePayloads([items]);
  return { ads: ads.slice(0, limit), complete: ads.length < limit, via: "apify" };
}

/** When Meta last walled the direct read: for a while after, go straight to the fallbacks. */
let blockedUntil = 0;
const BLOCK_PAUSE_MS = 10 * 60_000;

/**
 * Active ads for a Page, or for a keyword, most impressions (or reach) first.
 * In order: TRND's scraper worker (a real browser behind a residential proxy),
 * the direct read, Meta's API, the paid Apify actor. `backup:
 * false` never pays for Apify (for searches that are nice to have).
 */
export async function scrapeAds(search: Search, limit = env.adsPerRival, opts: { backup?: boolean } = {}): Promise<ScrapeResult> {
  const paid = opts.backup !== false && Boolean(env.apifyToken);
  const errors: string[] = [];

  if (hasWorker()) {
    try {
      const { ads, complete } = await fromWorker(search, limit);
      return { ads, complete, via: "worker" };
    } catch (err) {
      console.warn("[adlibrary] worker failed:", (err as Error).message);
      errors.push((err as Error).message);
    }
  }

  if (Date.now() >= blockedUntil) {
    try {
      return await fromLibrary(search, limit);
    } catch (err) {
      if (err instanceof ScrapeBlockedError) blockedUntil = Date.now() + BLOCK_PAUSE_MS;
      errors.push((err as Error).message);
    }
  } else {
    errors.push("Meta walled the direct read a few minutes ago");
  }

  if (isMetaApiConfigured()) {
    try {
      const { ads, complete } = await fromMetaApi(search, limit);
      return { ads, complete, via: "api" };
    } catch (err) {
      console.warn("[adlibrary] Meta API failed:", (err as Error).message);
      errors.push((err as Error).message);
    }
  }

  if (paid) {
    console.warn("[adlibrary] trying Apify after:", errors.join("; "));
    return fromApify(search, limit);
  }
  const hint = isMetaApiConfigured() ? "" : " Set META_ACCESS_TOKEN to read through Meta's free API instead.";
  throw new ScrapeBlockedError(`${errors.join(". ")}.${hint}`);
}
