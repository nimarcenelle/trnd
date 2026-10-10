"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { generateBusinessBrief } from "@/lib/ai/brief";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { cleanSocialHandles } from "@/lib/import/social-links";
import { normalizeUrl } from "@/lib/import/website";

export interface UrlStartState {
  error?: string;
}

const cents = (price: string): number | null => {
  const n = Math.round(parseFloat(price.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Onboarding is one field: the store's address. The site is read the way
 * the free read reads it (name, category, products, prices, voice), its
 * social accounts are taken from its own links, and the brand exists the
 * moment that lands. Everything else happens behind the redirect: the
 * founding analysis, naming the competitors, and the first read of every
 * competitor's ads and the brand's own, so the board fills in within
 * minutes instead of waiting for the next daily run. The week job then
 * takes over on its own clock, as it always has.
 */
export async function startFromUrlAction(_prev: UrlStartState, formData: FormData): Promise<UrlStartState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  if (await repo.getBusinessByOwner(user.id)) redirect("/app/rivals");

  const url = normalizeUrl(String(formData.get("website") ?? "").trim());
  if (!url) return { error: "That doesn't look like a web address. Try yourbrand.com." };

  const [{ readProspectSite }, { readRivalSite }] = await Promise.all([import("@/lib/prospect/teardown"), import("@/lib/intel/direct")]);
  let site;
  try {
    const [read, own] = await Promise.all([readProspectSite(url), readRivalSite(url).catch(() => null)]);
    site = { ...read, handles: own?.handles ?? {} };
  } catch (err) {
    console.warn("[onboarding:url] site read failed:", (err as Error).message);
    return { error: "We couldn't read that site. Check the address, or try your store's homepage." };
  }

  const business = await repo.createBusiness({
    owner_id: user.id,
    name: site.name,
    category: site.category,
    city: site.city,
    region: site.region,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: 20,
    website: site.website,
    price_band: site.priceBand,
    brand_voice_notes: site.voiceHint,
    photo_urls: [],
    social_handles: cleanSocialHandles(site.handles),
    market: "online",
    monthly_ad_spend: null,
    ad_platforms: ["meta"],
  });
  const services = await repo.createServices(
    site.services.map((s) => ({ business_id: business.id, name: s.name, description: null, price_cents: cents(s.price), is_active: true })),
  );

  try {
    const { getOrCreateSubscription } = await import("@/lib/billing");
    await getOrCreateSubscription(repo, business);
  } catch (err) {
    console.warn("[onboarding:url] trial subscription init failed (non-fatal):", (err as Error).message);
  }

  after(() =>
    import("@/lib/notify").then(({ notifyFounder }) =>
      notifyFounder({ kind: "signup", email: user.email, businessName: business.name, category: business.category, city: business.city }),
    ),
  );

  const { requestOrigin, kickWeekJob } = await import("@/lib/picks/kick");
  const origin = await requestOrigin();
  after(async () => {
    try {
      await repo.upsertBusinessBrief(await generateBusinessBrief(business, services, site.text));
    } catch (err) {
      console.warn("[onboarding:url] analysis failed (non-fatal):", (err as Error).message);
    }
    // The board is the first screen: name the rivals and read everyone's
    // ads now rather than at tomorrow's daily run.
    try {
      const { discoverCompetingBrands } = await import("@/lib/intel/discover-brands");
      await discoverCompetingBrands(repo, business);
      const { runIntelIngestForBusiness } = await import("@/lib/intel/ingest");
      await runIntelIngestForBusiness(repo, business, { budgetMs: 180_000 });
    } catch (err) {
      console.warn("[onboarding:url] first competitor read failed (the daily run retries):", (err as Error).message);
    }
    await kickWeekJob(business.id, { origin });
  });

  redirect("/app/rivals");
}
