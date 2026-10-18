/**
 * A Facebook Page's numeric id from its public page. The id is what the Ad
 * Library is keyed by, and the logged-out page HTML carries it in a few
 * places: the classic Page id behind a new-style profile ("delegate_page"),
 * the app deep link (fb://page/ID), or the page's own "pageID".
 */

import { workerFetch } from "./worker";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const ID_PATTERNS = [
  /"delegate_page":\{[^{}]*?"id":"(\d{5,})"/,
  /"delegate_page_id":"(\d{5,})"/,
  /fb:\/\/page\/\?id=(\d{5,})/,
  /fb:\/\/page\/(\d{5,})/,
  /"pageID":"(\d{5,})"/,
  /fb:\/\/profile\/(\d{5,})/,
];

/** Pure: the Page id and name in a facebook.com page's HTML. */
export function pageFromHtml(html: string): { pageId: string; pageName: string | null } | null {
  for (const re of ID_PATTERNS) {
    const id = html.match(re)?.[1];
    if (id) {
      const raw = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1] ?? null;
      const pageName = raw ? raw.replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').trim() || null : null;
      return { pageId: id, pageName };
    }
  }
  return null;
}

/** A Page handle ("brand") or id → its id and name, or null when Facebook will not say. */
export async function lookupFacebookPage(ref: string): Promise<{ pageId: string; pageName: string | null } | null> {
  if (/^\d{5,}$/.test(ref)) return { pageId: ref, pageName: null };
  const handle = ref.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9.\-]{2,80}$/.test(handle)) return null;
  try {
    const res = await fetch(`https://www.facebook.com/${encodeURIComponent(handle)}/`, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const direct = res.ok ? pageFromHtml(await res.text()) : null;
    if (direct) return direct;
  } catch {
    // walled or unreachable: the worker's browser may get through
  }
  const html = await workerFetch(`https://www.facebook.com/${encodeURIComponent(handle)}/`);
  return html ? pageFromHtml(html) : null;
}
