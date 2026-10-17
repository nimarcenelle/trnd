import { env } from "@/lib/env";
import { NoRetry, withRetry } from "@/lib/retry";

import type { ScrapedAd } from "./parse";

/**
 * Meta's official Ad Library API (graph.facebook.com/ads_archive): free, no
 * scraping, never walled. For ordinary commercial ads it only returns ads
 * shown in the EU (the transparency rules it exists for), so it is the
 * fallback when the direct read is walled, not the first choice. In return
 * it gives each ad's EU reach, which ranks ads better than position does.
 */

export const isMetaApiConfigured = () => Boolean(env.metaAccessToken);

/** The countries the API covers for non-political ads. */
export const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "eu_total_reach",
].join(",");

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

/** One ads_archive record → the shape the rest of TRND reads. */
export function fromArchive(o: Obj): ScrapedAd | null {
  const id = typeof o.id === "string" ? o.id : typeof o.id === "number" ? String(o.id) : null;
  if (!id) return null;
  const bodies = strs(o.ad_creative_bodies);
  const titles = strs(o.ad_creative_link_titles);
  const caption = strs(o.ad_creative_link_captions)[0] ?? null;
  // The caption is usually the destination's domain ("SLAP.ART"): enough to match a company to its site.
  const linkUrl = caption && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(caption.trim()) ? `https://${caption.trim().toLowerCase()}` : null;
  const start = typeof o.ad_delivery_start_time === "string" ? o.ad_delivery_start_time.slice(0, 10) : null;
  const reach = typeof o.eu_total_reach === "number" ? o.eu_total_reach : typeof o.eu_total_reach === "string" ? Number(o.eu_total_reach) || null : null;
  return {
    archiveId: id,
    pageId: typeof o.page_id === "string" ? o.page_id : o.page_id ? String(o.page_id) : null,
    pageName: typeof o.page_name === "string" ? o.page_name : null,
    pageUrl: null,
    body: bodies[0]?.slice(0, 2000) ?? null,
    title: titles[0] ?? null,
    cta: null,
    linkUrl,
    format: "unknown",
    imageUrl: null,
    videoUrl: null,
    platforms: strs(o.publisher_platforms).map((p) => p.toLowerCase()),
    variants: Math.max(1, new Set(bodies).size),
    startedAt: start,
    // A stop time means it has stopped (inactive reads); active reads carry none.
    active: !o.ad_delivery_stop_time,
    reach,
  };
}

/** What a Graph API error means for the owner. */
export function apiError(status: number, body: unknown): string {
  const err = isObj(body) && isObj(body.error) ? body.error : {};
  const code = typeof err.code === "number" ? err.code : null;
  if (code === 190) return "Meta's API token has expired. Make a new one at developers.facebook.com/tools/ad-library and update META_ACCESS_TOKEN.";
  if (code === 10 || code === 200 || code === 2332004) return "Meta's API refused the token: the account needs Ad Library API access (confirm your ID at facebook.com/ID).";
  if (code === 4 || code === 17 || code === 613) return "Meta's API rate limit was hit. The next scan tries again.";
  return `Meta's API answered ${status}${typeof err.message === "string" ? `: ${err.message}` : ""}`;
}

export class MetaApiError extends NoRetry {}

export async function fromMetaApi(search: ({ pageId: string } | { query: string }) & { status?: "active" | "inactive" }, limit: number): Promise<{ ads: ScrapedAd[]; complete: boolean }> {
  const p = new URLSearchParams({
    access_token: env.metaAccessToken,
    ad_type: "ALL",
    ad_active_status: search.status === "inactive" ? "INACTIVE" : "ACTIVE",
    ad_reached_countries: JSON.stringify(EU),
    fields: FIELDS,
    limit: String(Math.min(100, limit)),
  });
  if ("pageId" in search) p.set("search_page_ids", JSON.stringify([search.pageId]));
  else {
    p.set("search_terms", search.query);
    p.set("search_type", "KEYWORD_UNORDERED");
  }
  let next: string | null = `https://graph.facebook.com/${env.metaApiVersion}/ads_archive?${p}`;
  const ads = new Map<string, ScrapedAd>();
  while (next && ads.size < limit) {
    const url: string = next;
    const page = await withRetry(async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const message = apiError(res.status, body);
        throw res.status >= 500 ? new Error(message) : new MetaApiError(message);
      }
      return body as Obj;
    });
    for (const item of Array.isArray(page.data) ? page.data : []) {
      const ad = isObj(item) ? fromArchive(item) : null;
      if (ad) ads.set(ad.archiveId, ad);
    }
    next = isObj(page.paging) && typeof page.paging.next === "string" ? page.paging.next : null;
  }
  // Most reached first: the API's stand-in for the library's impressions order.
  const list = [...ads.values()].sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1)).slice(0, limit);
  return { ads: list, complete: !next };
}
