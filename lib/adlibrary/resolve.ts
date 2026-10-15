import "server-only";

import { huntPage, type PageCandidateLine, type PageHunt } from "@/lib/ai/analyze";
import { isModelConfigured } from "@/lib/env";
import { readSitePage } from "@/lib/site";

import { lookupFacebookPage } from "./facebook";
import { domainOf, facebookHandle, linkDomain, scorePages, SURE_POINTS, type PageCandidate, type PageMatch, type RivalRef } from "./match";
import type { ScrapedAd } from "./parse";
import { scrapeAds } from "./scrape";

/**
 * Which Facebook Page a company advertises from. In order, stopping at the
 * first sure answer:
 *
 * 1. The company's site links to its Page: look the Page up on facebook.com.
 * 2. Search the Ad Library for its name, its domain and its Page handle. An ad
 *    from a Page the site links to, or an ad linking to the company's domain,
 *    is sure.
 * 3. A Page that only shares the name is not sure (a Romanian shapewear Page
 *    called Jolie is not Jolie the showerhead), so the model looks at every
 *    advertiser found, their ads and where those ads link, and picks one or
 *    none. When it picks none it names the handles and names the company
 *    more likely advertises under; those are searched, and it picks again.
 *
 * Nothing found means the company is not running Meta ads under any name we
 * could find, and the caller says so with what was searched.
 */

export type Resolution =
  | { page: PageMatch; via: "site" | "search" | "model" }
  | { page: null; tried: string[] };

const MAX_CANDIDATES = 8;

export interface Company {
  name: string;
  website: string | null;
  category?: string | null;
}

function lines(candidates: PageCandidate[]): PageCandidateLine[] {
  return candidates.slice(0, MAX_CANDIDATES).map((c) => ({
    pageId: c.pageId,
    pageName: c.pageName,
    pageUrl: c.pageUrl,
    samples: c.ads.slice(0, 3).map((a) => ({ body: a.body, title: a.title, link: linkDomain(a.linkUrl) })),
  }));
}

/** The company's site's Facebook link, if it has one. */
async function siteFacebook(website: string | null): Promise<string | null> {
  if (!website) return null;
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return readSitePage(url)
    .then((r) => r.socials.facebook)
    .catch(() => null);
}

export async function findPage(company: Company, opts: { exclude?: string[] } = {}): Promise<Resolution> {
  const exclude = new Set(opts.exclude ?? []);
  const facebook = await siteFacebook(company.website);

  // 2. Keyword searches.
  const ref: RivalRef = { name: company.name, website: company.website, facebook, aliases: [] };
  const tried: string[] = [];
  const pool = new Map<string, ScrapedAd>();
  let firstError: unknown = null;
  let anyRead = false;

  // 1. The Page the site links to. A brand sometimes advertises from a
  // different Page than the one its footer links to (a regional or shop
  // Page), so a linked Page with no ads is checked against a search before
  // it is taken: a Page whose ads link to the site wins over an idle one.
  if (facebook) {
    const page = await lookupFacebookPage(facebook);
    if (page && !exclude.has(page.pageId)) {
      const linked = { pageId: page.pageId, pageName: page.pageName ?? company.name };
      const peek = await scrapeAds({ pageId: page.pageId }, 12).catch(() => null);
      if (!peek || peek.ads.length > 0 || !peek.complete) return { page: linked, via: "site" };
      const domain = domainOf(company.website);
      for (const term of [company.name, domain]) {
        if (!term) continue;
        try {
          const { ads } = await scrapeAds({ query: term }, 60);
          tried.push(term);
          for (const ad of ads) if (ad.pageId && !exclude.has(ad.pageId)) pool.set(ad.archiveId, ad);
        } catch {
          /* the linked Page still stands */
        }
      }
      const best = scorePages(ref, [...pool.values()]).find((c) => c.pageId !== page.pageId && c.points >= SURE_POINTS);
      if (best) return { page: { pageId: best.pageId, pageName: best.pageName }, via: "search" };
      return { page: linked, via: "site" };
    }
  }

  const search = async (term: string) => {
    const t = term.trim();
    if (!t || tried.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    tried.push(t);
    try {
      const { ads } = await scrapeAds({ query: t }, 60);
      anyRead = true;
      for (const ad of ads) if (ad.pageId && !exclude.has(ad.pageId)) pool.set(ad.archiveId, ad);
    } catch (err) {
      firstError ??= err;
    }
  };
  const sure = () => {
    const best = scorePages(ref, [...pool.values()])[0];
    return best && best.points >= SURE_POINTS ? best : null;
  };

  const domain = domainOf(company.website);
  const domainWord = domain?.split(".")[0] ?? null;
  const handle = facebook && !/^\d+$/.test(facebook) ? facebook : null;
  for (const term of [company.name, domainWord, domain, handle]) {
    if (!term) continue;
    await search(term);
    const hit = sure();
    if (hit) return { page: { pageId: hit.pageId, pageName: hit.pageName }, via: "search" };
  }
  if (!anyRead && firstError) throw firstError;

  // 3. The model looks, and suggests where else to look.
  if (!isModelConfigured) return { page: null, tried };
  /** The model's choice among everything found so far, or its suggestions when it chooses none. */
  const pick = async (): Promise<PageMatch | PageHunt> => {
    const candidates = scorePages(ref, [...pool.values()]);
    const hunt = await huntPage(company, lines(candidates), tried);
    const chosen = candidates.find((c) => c.pageId === hunt.page_id.trim());
    return chosen ? { pageId: chosen.pageId, pageName: chosen.pageName } : hunt;
  };

  const first = await pick();
  if ("pageId" in first) return { page: first, via: "model" };
  const hunt = first;

  // The handles the model believes in: read their ads into the pool.
  for (const guess of hunt.facebook_pages.slice(0, 3)) {
    const h = facebookHandle(guess) ?? guess.replace(/^@/, "").trim();
    if (!h) continue;
    const page = await lookupFacebookPage(h);
    tried.push(`facebook.com/${h}`);
    if (!page || exclude.has(page.pageId)) continue;
    try {
      const { ads } = await scrapeAds({ pageId: page.pageId }, 12);
      for (const ad of ads) pool.set(ad.archiveId, { ...ad, pageId: ad.pageId ?? page.pageId, pageName: ad.pageName ?? page.pageName });
    } catch {
      // a Page we cannot read adds nothing
    }
  }
  ref.aliases = hunt.search_terms.slice(0, 3);
  for (const term of ref.aliases) await search(term);
  const hit = sure();
  if (hit) return { page: { pageId: hit.pageId, pageName: hit.pageName }, via: "search" };
  if (!pool.size) return { page: null, tried };

  const second = await pick();
  if ("pageId" in second) return { page: second, via: "model" };
  return { page: null, tried };
}

/**
 * Whether the Page we hold really is the company's, judged on its ads. Ads
 * linking to the company's own domain settle it; a Page whose ads all link
 * somewhere else gets a second look from the model.
 */
export async function pageLooksRight(company: Company, page: PageMatch & { pageUrl?: string | null }, ads: ScrapedAd[]): Promise<boolean> {
  const domain = domainOf(company.website);
  const linked = ads.map((a) => linkDomain(a.linkUrl)).filter((d): d is string => Boolean(d) && d !== "facebook.com" && d !== "instagram.com");
  if (!domain || linked.length < 2 || linked.includes(domain)) return true;
  if (!isModelConfigured) return true;
  const candidates = scorePages({ name: company.name, website: company.website }, ads);
  const hunt = await huntPage(company, lines(candidates), [company.name]);
  return hunt.page_id.trim() === page.pageId;
}

/**
 * A Page from what an owner pasted: an Ad Library link (view_all_page_id=…),
 * a facebook.com link, a numeric id or a bare handle. Null when it names no
 * Page we can find.
 */
export async function pageFromInput(input: string): Promise<PageMatch | null> {
  const raw = input.trim();
  if (!raw) return null;
  const viewAll = raw.match(/view_all_page_id=(\d{5,})/)?.[1];
  if (viewAll) return { pageId: viewAll, pageName: "" };
  const ref = /facebook\.com|fb\.com/i.test(raw) ? facebookHandle(raw) : raw.replace(/^@/, "");
  if (!ref) return null;
  if (/^\d{5,}$/.test(ref)) return { pageId: ref, pageName: "" };
  const page = await lookupFacebookPage(ref);
  if (page) return { pageId: page.pageId, pageName: page.pageName ?? "" };
  // Facebook would not say: find an ad from the Page with that address.
  const { ads } = await scrapeAds({ query: ref }, 60).catch(() => ({ ads: [] as ScrapedAd[] }));
  const best = scorePages({ name: ref, website: null, facebook: ref.toLowerCase() }, ads).find((c) => facebookHandle(c.pageUrl) === ref.toLowerCase());
  return best ? { pageId: best.pageId, pageName: best.pageName } : null;
}
