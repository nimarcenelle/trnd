import type { ScrapedAd } from "./parse";

/**
 * A keyword search for a rival's name returns every advertiser that mentions
 * it. This picks the one Page that is the rival: by the rival's website domain
 * in the ad's link, or failing that by name. The name match is strict (the
 * same company once generic words are gone, never a substring), because a
 * substring match once filed "Roz Strategies" under a haircare brand called
 * Roz. A name match alone is never sure: a Romanian shapewear Page called
 * Jolie is not Jolie the showerhead brand.
 */

const GENERIC = new Set([
  "the", "a", "an", "my", "and", "official", "inc", "llc", "ltd", "co", "company", "corp",
  "shop", "store", "brand", "brands", "usa", "us", "uk", "hq", "global",
]);

export function nameCore(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !GENERIC.has(w));
}

export function sameName(a: string, b: string): boolean {
  const x = nameCore(a);
  const y = nameCore(b);
  if (!x.length || !y.length) return false;
  const squash = (ws: string[]) => ws.join("").replace(/and/g, "");
  return squash(x) === squash(y);
}

/** "https://www.Brand.com/p?x" → "brand.com". */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "").replace(/^(shop|store|m|l)\./, "");
  } catch {
    return null;
  }
}

/**
 * Meta wraps outbound links in l.facebook.com/l.php?u=..., so unwrap before
 * comparing domains.
 */
export function linkDomain(link: string | null): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    const inner = u.searchParams.get("u");
    if (/facebook\.com$/.test(u.hostname) && inner) return domainOf(inner);
  } catch {
    // fall through
  }
  return domainOf(link);
}

export interface PageMatch {
  pageId: string;
  pageName: string;
}

export interface RivalRef {
  name: string;
  website: string | null;
  /** Other names the Page may go by (from the model). */
  aliases?: string[];
  /** The Page handle or id the rival's site links to. */
  facebook?: string | null;
}

export interface PageCandidate extends PageMatch {
  pageUrl: string | null;
  points: number;
  ads: ScrapedAd[];
}

/** "https://www.facebook.com/Brand/" → "brand"; "…/profile.php?id=12" → "12". */
export function facebookHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!/(^|\.)(facebook|fb)\.com$/i.test(u.hostname)) return null;
    const id = u.searchParams.get("id");
    if (id && /^\d+$/.test(id)) return id;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "people" || parts[0] === "pages") return parts.find((p) => /^\d+$/.test(p)) ?? null;
    if (parts[0] === "pg") return parts[1]?.toLowerCase() ?? null;
    return parts[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Every Page in a keyword search's ads, scored for how surely it is the rival:
 * its site links to the Page (+3 per ad), the ad links to the rival's domain
 * (+3), or the Page has the rival's name or an alias (+2). Pages that score
 * nothing are kept at 0 so the model can still look at them.
 */
export function scorePages(rival: RivalRef, ads: ScrapedAd[]): PageCandidate[] {
  const site = domainOf(rival.website);
  const fb = rival.facebook?.toLowerCase() ?? null;
  const names = [rival.name, ...(rival.aliases ?? [])];
  const pages = new Map<string, PageCandidate>();
  for (const ad of ads) {
    if (!ad.pageId) continue;
    let points = 0;
    if (fb && (fb === ad.pageId || fb === facebookHandle(ad.pageUrl))) points += 3;
    if (site && linkDomain(ad.linkUrl) === site) points += 3;
    if (ad.pageName && names.some((n) => sameName(ad.pageName!, n))) points += 2;
    const page = pages.get(ad.pageId) ?? { pageId: ad.pageId, pageName: ad.pageName ?? rival.name, pageUrl: ad.pageUrl, points: 0, ads: [] };
    page.points += points;
    page.pageUrl ??= ad.pageUrl;
    page.ads.push(ad);
    pages.set(ad.pageId, page);
  }
  return [...pages.values()].sort((a, b) => b.points - a.points || b.ads.length - a.ads.length);
}

/** Points that make a Page surely the rival's: its site links to it, or its ads link to the rival's site. A shared name alone is not enough. */
export const SURE_POINTS = 3;

/** The rival's own Page among a keyword search's ads, or null when none is surely theirs (the model then looks). */
export function pickRivalPage(rival: RivalRef, ads: ScrapedAd[]): PageMatch | null {
  const best = scorePages(rival, ads)[0];
  return best && best.points >= SURE_POINTS ? { pageId: best.pageId, pageName: best.pageName } : null;
}
