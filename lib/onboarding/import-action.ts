"use server";

import { getSessionUser } from "@/lib/auth/session";
import { isGeminiConfigured } from "@/lib/env";
import {
  extractFromPages,
  fetchSiteCorpus,
  inferPriceBand,
  normalizeUrl,
  type SiteImport,
} from "@/lib/import/website";

/** Site text round-trips through a hidden form field into brief generation. */
const MAX_SITE_TEXT = 12_000;

export interface ImportResult {
  ok: boolean;
  reason?: string;
  data?: SiteImport;
  /** Plain text of the crawled pages — feeds the founding analysis. */
  siteText?: string;
}

/**
 * Owner-initiated read of their own website during onboarding: the homepage
 * plus up to four relevant pages (menu, pricing, services, about), 8s
 * timeout each. Deterministic extraction always; Gemini refines when
 * configured. Failure is normal and non-blocking — onboarding continues
 * manually.
 */
export async function importFromWebsiteAction(rawUrl: string): Promise<ImportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Not signed in." };

  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "That doesn't look like a web address." };

  let corpus: Awaited<ReturnType<typeof fetchSiteCorpus>>;
  try {
    corpus = await fetchSiteCorpus(url);
  } catch (err) {
    return {
      ok: false,
      reason: `Couldn't reach the site (${(err as Error).message.slice(0, 60)}) — fill in the details manually.`,
    };
  }

  let data = extractFromPages(corpus.pages);

  if (isGeminiConfigured) {
    try {
      const { extractSiteWithGemini } = await import("@/lib/ai/gemini");
      const refined = await extractSiteWithGemini(corpus.text, url);
      // Gemini wins where it found something; heuristics fill its gaps.
      const services = refined.services.length > 0 ? refined.services : data.services;
      const category = refined.category ?? data.category;
      data = {
        name: refined.name ?? data.name,
        category,
        city: refined.city ?? data.city,
        region: refined.region ?? data.region,
        services,
        voiceHint: refined.voiceHint ?? data.voiceHint,
        priceBand: refined.priceBand ?? inferPriceBand(services, category) ?? data.priceBand,
      };
    } catch (err) {
      console.warn("[import] Gemini refine failed — using heuristics:", (err as Error).message);
    }
  }

  const foundAnything =
    Boolean(data.name || data.category || data.city) || data.services.length > 0;
  if (!foundAnything) {
    return { ok: false, reason: "Reached the site but couldn't read offerings — fill in manually." };
  }
  return { ok: true, data, siteText: corpus.text.slice(0, MAX_SITE_TEXT) };
}