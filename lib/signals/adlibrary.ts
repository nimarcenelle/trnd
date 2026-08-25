import type { Renderer } from "@/lib/import/render";
import { htmlToText } from "@/lib/import/website";

import type { AdapterFetchInput, RawSignal, SignalAdapter } from "./types";

/**
 * Meta Ad Library, read the way a person would: the public search page,
 * rendered headlessly, no login. Two products from one read — a REAL
 * competitor-saturation count (replacing the news-coverage proxy) and a
 * swipe file of what nearby advertisers are actually running. Playwright
 * only; where it isn't installed the adapter skips and the proxy stands.
 */

export interface AdLibraryAd {
  advertiser: string;
  snippet: string;
}

export interface AdLibraryRead {
  total: number | null;
  ads: AdLibraryAd[];
}

const CTA_LINE =
  /^(learn more|book now|shop now|sign up|get offer|get quote|contact us|send message|apply now|subscribe|download|order now|see menu|call now|get directions|watch more|play game|install now)$/i;
const NOISE_LINE = /^(active|inactive|platforms|open dropdown|see ad details|this ad has multiple versions|started running on .*|remove|sort by|filters|sort)$/i;
const DOMAIN_LINE = /^[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,}(\/\S*)?$/;

/** Pure parser over the page's visible text — unit-tested with a live fixture. */
export function parseAdLibrary(text: string): AdLibraryRead {
  const totalMatch = text.match(/~?\s*([\d,]+)\+?\s+results?/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null;

  const ads: AdLibraryAd[] = [];
  const seen = new Set<string>();
  const blocks = text.split(/\nLibrary ID: /).slice(1);
  for (const block of blocks) {
    if (ads.length >= 5) break;
    const lines = block
      .split("\n")
      .map((l) => l.replace(/[​‎‏]/g, "").trim())
      .filter((l) => l.length > 0);
    const idx = lines.findIndex((l) => / Sponsored$/.test(l));
    if (idx === -1) continue;
    const advertiser = lines[idx].replace(/ Sponsored$/, "").trim();
    if (!advertiser || seen.has(advertiser.toLowerCase())) continue;
    const copy: string[] = [];
    for (const line of lines.slice(idx + 1)) {
      if (CTA_LINE.test(line) || DOMAIN_LINE.test(line) || NOISE_LINE.test(line)) break;
      copy.push(line);
      if (copy.join(" ").length > 200) break;
    }
    if (copy.length === 0) continue;
    seen.add(advertiser.toLowerCase());
    ads.push({ advertiser, snippet: copy.join(" ").slice(0, 200) });
  }
  return { total, ads };
}

export function adLibraryUrl(term: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(term)}&search_type=keyword_unordered&media_type=all`;
}

export async function fetchAdLibraryRead(
  renderer: Renderer,
  term: string,
): Promise<AdLibraryRead | null> {
  const html = await renderer.render(adLibraryUrl(term));
  if (!html) return null;
  const read = parseAdLibrary(htmlToText(html));
  // A page that rendered but shows no results count is a wall, not a zero.
  return read.total === null && read.ads.length === 0 ? null : read;
}

/** Query cap per run — each read is a full page render (~10s). */
const MAX_READS = 10;

export function createMetaAdsAdapter(): SignalAdapter {
  return {
    name: "meta_ads",
    async isAvailable() {
      return true; // the real gate is renderer acquisition below
    },
    async fetch({ watch, geo, windowDays }: AdapterFetchInput): Promise<RawSignal[]> {
      // Only business-scoped terms (they carry a state geo) — those are the
      // ones whose saturation the score actually uses.
      const targets = watch.filter((w) => w.geo).slice(0, MAX_READS);
      if (targets.length === 0) return [];
      const { getRenderer } = await import("@/lib/import/render");
      const renderer = await getRenderer();
      if (!renderer) return [];
      const out: RawSignal[] = [];
      try {
        for (const t of targets) {
          try {
            const read = await fetchAdLibraryRead(renderer, t.term);
            if (!read) continue;
            out.push({
              source: "meta_ads",
              term: t.term,
              category: t.category,
              geo: t.geo ?? geo ?? "US",
              metric_type: "ad_saturation",
              value: read.total,
              delta_pct: null,
              window_days: windowDays,
              raw: { ads: read.ads },
            });
          } catch (err) {
            console.warn(`[signals:meta_ads] "${t.term}" failed:`, (err as Error).message);
          }
        }
      } finally {
        await renderer.close();
      }
      return out;
    },
  };
}