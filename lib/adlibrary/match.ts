import type { ScrapedAd } from "./parse";

/**
 * A keyword search for a rival's name returns every advertiser that mentions
 * it. This picks the one Page that is the rival: by the rival's website domain
 * in the ad's link, or failing that by name. The name match is strict (the
 * same company once generic words are gone, never a substring), because a
 * substring match once filed "Roz Strategies" under a haircare brand called
 * Roz.
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
function linkDomain(link: string | null): string | null {
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

/** The rival's own Page among a keyword search's ads, or null when none is clearly theirs. */
export function pickRivalPage(rival: { name: string; website: string | null }, ads: ScrapedAd[]): PageMatch | null {
  const site = domainOf(rival.website);
  const score = new Map<string, { name: string; points: number }>();
  for (const ad of ads) {
    if (!ad.pageId) continue;
    let points = 0;
    if (site && linkDomain(ad.linkUrl) === site) points += 3;
    if (ad.pageName && sameName(ad.pageName, rival.name)) points += 2;
    if (!points) continue;
    const prev = score.get(ad.pageId);
    score.set(ad.pageId, { name: ad.pageName ?? prev?.name ?? rival.name, points: (prev?.points ?? 0) + points });
  }
  const best = [...score.entries()].sort((a, b) => b[1].points - a[1].points)[0];
  return best ? { pageId: best[0], pageName: best[1].name } : null;
}
