"use server";

import { getSessionUser } from "@/lib/auth/session";
import { isGeminiConfigured } from "@/lib/env";
import {
  extractFromHtml,
  fetchSiteHtml,
  normalizeUrl,
  type SiteImport,
} from "@/lib/import/website";

export interface ImportResult {
  ok: boolean;
  reason?: string;
  data?: SiteImport;
}

/**
 * Owner-initiated read of their own website during onboarding. One fetch,
 * 8s timeout. Deterministic extraction always; Gemini refines when
 * configured. Failure is normal and non-blocking — onboarding continues
 * manually.
 */
export async function importFromWebsiteAction(rawUrl: string): Promise<ImportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Not signed in." };

  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "That doesn't look like a web address." };

  let html: string;
  try {
    html = await fetchSiteHtml(url);
  } catch (err) {
    return {
      ok: false,
      reason: `Couldn't reach the site (${(err as Error).message.slice(0, 60)}) — fill in the details manually.`,
    };
  }

  let data = extractFromHtml(html);

  if (isGeminiConfigured) {
    try {
      const { extractSiteWithGemini } = await import("@/lib/ai/gemini");
      const refined = await extractSiteWithGemini(html, url);
      // Gemini wins where it found something; heuristics fill its gaps.
      data = {
        name: refined.name ?? data.name,
        category: refined.category ?? data.category,
        city: refined.city ?? data.city,
        region: refined.region ?? data.region,
        services: refined.services.length > 0 ? refined.services : data.services,
        voiceHint: refined.voiceHint ?? data.voiceHint,
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
  return { ok: true, data };
}
