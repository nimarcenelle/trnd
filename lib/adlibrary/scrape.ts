import { env } from "@/lib/env";
import { fetchRetry } from "@/lib/retry";

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

export type Search = { pageId: string } | { query: string };

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

/** Cookies from a response, folded into one Cookie header for the follow-ups. */
function cookieHeader(res: Response): string {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return all.map((c) => c.split(";")[0]).join("; ");
}

async function fromLibrary(search: Search, limit: number): Promise<ScrapeResult> {
  const res = await fetchRetry(libraryUrl(search), {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
    },
    redirect: "follow",
    timeoutMs: 25_000,
    cache: "no-store",
  });
  const html = await res.text();
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
  const { lsd, docId } = pageTokens(html);
  const cookies = cookieHeader(res);
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
async function fromApify(search: Search, limit: number): Promise<ScrapeResult> {
  const url = `https://api.apify.com/v2/acts/${env.apifyAdLibraryActor}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;
  const res = await fetchRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls: [{ url: libraryUrl(search) }], count: limit, "scrapePageAds.activeStatus": "active" }),
    timeoutMs: 240_000,
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
