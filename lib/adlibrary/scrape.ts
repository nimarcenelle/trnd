import { env } from "@/lib/env";

import { graphqlBlocks, jsonBlocks, looksBlocked, pageTokens, parsePayloads, type ScrapedAd } from "./parse";

/**
 * The Meta Ad Library, read the way the browser reads it: GET the library
 * page (the first page of results is in the HTML), then ask the page's own
 * GraphQL query for the rest. No login, no browser, no API key.
 *
 * Meta sometimes answers a datacenter IP with a login wall. When that happens
 * and APIFY_TOKEN is set, the same search goes through the Apify Ad Library
 * actor instead; without it the scan says it was blocked.
 */

const LIBRARY = "https://www.facebook.com/ads/library/";
const GRAPHQL = "https://www.facebook.com/api/graphql/";
const PAGE_SIZE = 30;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** `status`: active ads (the default) or the ones that have stopped, newest end first. */
export type Search = ({ pageId: string } | { query: string }) & { status?: "active" | "inactive" };

export interface ScrapeResult {
  ads: ScrapedAd[];
  /** Every active ad was read. False means a later page could not be fetched,
   * so an ad missing from this read may still be running. */
  complete: boolean;
  via: "library" | "apify";
}

export class ScrapeBlockedError extends Error {}

/** The library URL for a search, active ads only, most impressions first. */
export function libraryUrl(search: Search): string {
  const p = new URLSearchParams({
    active_status: search.status ?? "active",
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

/** Cookies from a response, folded into one Cookie header for the follow-ups. */
function cookieHeader(res: Response): string {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return all.map((c) => c.split(";")[0]).join("; ");
}

/**
 * The path of Meta's verification challenge, when a response is one. To a
 * client it does not recognize, the Ad Library answers 403 with a page whose
 * only content is a script that POSTs to a one-time path and reloads. The
 * POST clears the client (by address, no cookie involved) and the same
 * request then answers 200. From a datacenter address every first request
 * gets it, which is what sent every production read through Apify.
 */
export function challengePath(html: string): string | null {
  const m = html.match(/fetch\('(\/__rd_verify_[A-Za-z0-9_-]+\?challenge=\d+)'/);
  return m ? m[1] : null;
}

const PAGE_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
} as const;

/**
 * The pagination query's doc id, from a script bundle. The page used to
 * carry it; now it carries only the root query's, and the one the GraphQL
 * follow-ups need sits in one of the page's ~50 bundles as
 * `AdLibrarySearchPaginationQuery_facebookRelayOperation`. Looked up once per
 * process and kept.
 */
export function docIdFromBundle(js: string): string | null {
  return js.match(/AdLibrarySearchPaginationQuery_facebookRelayOperation[^]{0,160}?exports="(\d{15,17})"/)?.[1] ?? null;
}

let cachedDocId: string | null = null;

async function findDocId(html: string): Promise<string | null> {
  if (cachedDocId) return cachedDocId;
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const hits = await Promise.all(
    srcs.map(async (u) => {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
        return r.ok ? docIdFromBundle(await r.text()) : null;
      } catch {
        return null;
      }
    }),
  );
  cachedDocId = hits.find((h): h is string => Boolean(h)) ?? null;
  if (!cachedDocId) console.warn(`[adlibrary] pagination doc id not found in ${srcs.length} bundles; reading the first page only`);
  return cachedDocId;
}

/**
 * The session parameters Meta's GraphQL endpoint wants beside the query:
 * the server revision, the haste session, the spin markers and jazoest,
 * all printed in the page. Without them the pagination query answers
 * "Your Request Couldn't be Processed" (error 1357054) and a Page reads as
 * its first page only.
 */
export function sessionParams(html: string): Record<string, string> {
  const g = (re: RegExp) => html.match(re)?.[1] ?? "";
  const rev = g(/"server_revision":(\d+)/);
  return {
    __req: "3",
    __hs: g(/"haste_session":"([^"]+)"/),
    dpr: "1",
    __ccg: g(/"connectionClass":"(\w+)"/) || "EXCELLENT",
    __rev: rev,
    __s: "aaaaaa:bbbbbb:cccccc",
    __hsi: g(/"hsi":"(\d+)"/),
    __comet_req: "1",
    jazoest: g(/jazoest=(\d+)/),
    __spin_r: g(/"__spin_r":(\d+)/) || rev,
    __spin_b: g(/"__spin_b":"(\w+)"/) || "trunk",
    __spin_t: g(/"__spin_t":(\d+)/),
  };
}

async function fetchLibraryPage(url: string, cookie?: string): Promise<Response> {
  return fetch(url, {
    headers: cookie ? { ...PAGE_HEADERS, cookie } : PAGE_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
}

async function fromLibrary(search: Search, limit: number): Promise<ScrapeResult> {
  const url = libraryUrl(search);
  let res = await fetchLibraryPage(url);
  let html = await res.text();
  // The cookie the challenge hands back is what clears the next request.
  let verified = "";
  const challenge = res.status === 403 ? challengePath(html) : null;
  if (challenge) {
    const posted = await fetch(`https://www.facebook.com${challenge}`, {
      method: "POST",
      headers: { "user-agent": UA, referer: url, origin: "https://www.facebook.com" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    }).catch(() => null);
    verified = posted ? cookieHeader(posted) : "";
    res = await fetchLibraryPage(url, verified || undefined);
    html = await res.text();
  }
  if (!res.ok || looksBlocked(html) || res.url.includes("/login")) {
    throw new ScrapeBlockedError(`Ad Library answered ${res.status}${looksBlocked(html) ? " with a login wall" : ""}`);
  }
  const first = parsePayloads(jsonBlocks(html));
  if (first.ads.length === 0 && first.count === null) {
    // No ads and no result count: not an empty search, a page we cannot read.
    throw new ScrapeBlockedError("Ad Library page carried no results we could read");
  }

  const ads = new Map(first.ads.map((a) => [a.archiveId, a]));
  let { cursor, hasNext } = first;
  const tokens = pageTokens(html);
  const lsd = tokens.lsd;
  const docId = tokens.docId ?? (first.hasNext ? await findDocId(html) : null);
  const cookies = [verified, cookieHeader(res)].filter(Boolean).join("; ");
  const session = sessionParams(html);
  const sessionId = crypto.randomUUID();

  while (hasNext && cursor && ads.size < limit) {
    if (!lsd || !docId) break;
    const variables = {
      activeStatus: search.status ?? "active",
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
      ...session,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "AdLibrarySearchPaginationQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: docId,
    });
    let page;
    try {
      const r = await fetch(GRAPHQL, {
        method: "POST",
        headers: {
          "user-agent": UA,
          accept: "*/*",
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-lsd": lsd,
          "x-fb-friendly-name": "AdLibrarySearchPaginationQuery",
          "x-asbd-id": "359341",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          origin: "https://www.facebook.com",
          referer: libraryUrl(search),
          ...(cookies ? { cookie: cookies } : {}),
        },
        body,
        signal: AbortSignal.timeout(20_000),
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
async function fromApify(search: Search, limit: number): Promise<ScrapeResult> {
  const url = `https://api.apify.com/v2/acts/${env.apifyAdLibraryActor}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls: [{ url: libraryUrl(search) }], count: limit, "scrapePageAds.activeStatus": search.status ?? "active" }),
    signal: AbortSignal.timeout(240_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apify Ad Library actor answered ${res.status}`);
  const items = (await res.json()) as unknown[];
  const { ads } = parsePayloads([items]);
  return { ads: ads.slice(0, limit), complete: ads.length < limit, via: "apify" };
}

/** Active ads for a Page, or for a keyword, most impressions first. */
export async function scrapeAds(search: Search, limit = env.adsPerRival): Promise<ScrapeResult> {
  try {
    return await fromLibrary(search, limit);
  } catch (err) {
    if (!env.apifyToken) throw err;
    console.warn("[adlibrary] direct read failed, trying Apify:", (err as Error).message);
    return fromApify(search, limit);
  }
}
